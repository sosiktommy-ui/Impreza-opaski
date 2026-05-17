import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransferStatus, ItemType, Prisma, AuditAction, Role } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';

export interface SendTransferInput {
  fromUserId: string;
  toUserId: string;
  items: Array<{ itemType: ItemType; quantity: number }>;
  notes?: string;
  createdBy: string;
}

export interface AcceptanceItem {
  itemType: ItemType;
  receivedQuantity: number;
}

type BalanceColor = 'Black' | 'White' | 'Red' | 'Blue';

const ITEM_TO_COLOR: Record<string, BalanceColor> = {
  BLACK: 'Black',
  WHITE: 'White',
  RED: 'Red',
  BLUE: 'Blue',
};

function balanceField(c: BalanceColor) {
  return `balance${c}` as 'balanceBlack' | 'balanceWhite' | 'balanceRed' | 'balanceBlue';
}

const userInclude = {
  select: {
    id: true,
    displayName: true,
    username: true,
    role: true,
    primaryCity: {
      select: {
        id: true,
        name: true,
        slug: true,
        latitude: true,
        longitude: true,
        country: { select: { id: true, name: true, code: true } },
      },
    },
  },
} as const;

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly inventoryService: InventoryService,
  ) {}

  // -------------------------------------------------------------------------
  // SEND
  // -------------------------------------------------------------------------

  async sendTransfer(input: SendTransferInput) {
    const { fromUserId, toUserId, items, notes, createdBy } = input;

    if (fromUserId === toUserId) {
      throw new BadRequestException('Нельзя отправить перевод самому себе');
    }
    if (!items || items.length === 0) {
      throw new BadRequestException('Список предметов не может быть пустым');
    }
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException('Количество должно быть больше 0');
      }
    }

    const fromUser = await this.prisma.user.findUnique({
      where: { id: fromUserId },
      select: {
        id: true,
        role: true,
        isActive: true,
        primaryCityId: true,
        balanceBlack: true,
        balanceWhite: true,
        balanceRed: true,
        balanceBlue: true,
        balanceVersion: true,
      },
    });
    if (!fromUser) throw new NotFoundException('Отправитель не найден');
    if (!fromUser.isActive) throw new ForbiddenException('Аккаунт отправителя неактивен');

    const toUser = await this.prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, isActive: true, primaryCityId: true },
    });
    if (!toUser) throw new NotFoundException('Получатель не найден');
    if (!toUser.isActive) throw new ForbiddenException('Аккаунт получателя неактивен');

    // Build per-color totals from items
    const colorTotals: Partial<Record<BalanceColor, number>> = {};
    for (const item of items) {
      const color = ITEM_TO_COLOR[item.itemType];
      if (!color) throw new BadRequestException(`Неизвестный тип предмета: ${item.itemType}`);
      colorTotals[color] = (colorTotals[color] ?? 0) + item.quantity;
    }

    // Check balance
    for (const [color, qty] of Object.entries(colorTotals) as [BalanceColor, number][]) {
      const field = balanceField(color);
      if ((fromUser[field] as number) < qty) {
        throw new BadRequestException(`Недостаточно браслетов (${color.toLowerCase()}): нужно ${qty}, есть ${fromUser[field]}`);
      }
    }

    const transfer = await this.prisma.$transaction(async (tx) => {
      // Build optimistic-lock deduction query
      const decrementData: Record<string, any> = {
        balanceVersion: { increment: 1 },
      };
      const whereData: Record<string, any> = {
        id: fromUserId,
        balanceVersion: fromUser.balanceVersion,
      };
      for (const [color, qty] of Object.entries(colorTotals) as [BalanceColor, number][]) {
        decrementData[balanceField(color)] = { decrement: qty };
        whereData[balanceField(color)] = { gte: qty };
      }

      const updateCount = await (tx.user as any).updateMany({
        where: whereData,
        data: decrementData,
      });
      if (updateCount.count === 0) {
        throw new ConflictException('Баланс изменился, повторите попытку');
      }

      const newTransfer = await tx.transfer.create({
        data: {
          fromUserId,
          toUserId,
          status: TransferStatus.SENT,
          notes,
          createdBy,
          items: {
            create: items.map((i) => ({ itemType: i.itemType, quantity: i.quantity })),
          },
        },
        include: {
          items: true,
          fromUser: userInclude,
          toUser: userInclude,
        },
      });

      await this.writeTransferAudit(tx, AuditAction.TRANSFER_SENT, newTransfer.id, createdBy, {
        fromUserId,
        toUserId,
        items,
      });

      return newTransfer;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.eventEmitter.emit('transfer.sent', { transferId: transfer.id, fromUserId, toUserId });
    await this.redis.del(`balance:user:${fromUserId}`);

    return transfer;
  }

  // -------------------------------------------------------------------------
  // ACCEPT
  // -------------------------------------------------------------------------

  async acceptTransfer(transferId: string, receivedItems: AcceptanceItem[], actorId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: true,
        fromUser: { select: { id: true, primaryCityId: true, balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true } },
        toUser: { select: { id: true, primaryCityId: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Перевод не найден');
    if (transfer.status !== TransferStatus.SENT) {
      throw new BadRequestException(`Нельзя принять перевод со статусом ${transfer.status}`);
    }
    if (transfer.toUserId! !== actorId) {
      // Only ADMIN can accept on behalf of receiver
      const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (!actor || actor.role !== Role.ADMIN) {
        throw new ForbiddenException('Только получатель или администратор может принять перевод');
      }
    }

    // Build sent map
    const sentMap = new Map<ItemType, number>();
    for (const item of transfer.items) {
      sentMap.set(item.itemType, item.quantity);
    }

    // Validate received items
    for (const ri of receivedItems) {
      if (!sentMap.has(ri.itemType)) {
        throw new BadRequestException(`Тип предмета ${ri.itemType} не был отправлен`);
      }
      if (ri.receivedQuantity < 0) {
        throw new BadRequestException('Полученное количество не может быть отрицательным');
      }
    }

    const receivedMap = new Map<ItemType, number>();
    for (const ri of receivedItems) {
      receivedMap.set(ri.itemType, ri.receivedQuantity);
    }

    // Detect discrepancy
    let hasDiscrepancy = false;
    const totalReceived = Array.from(receivedMap.values()).reduce((a, b) => a + b, 0);

    if (totalReceived === 0) {
      // Nothing received > cancel
      return this._cancelAndRestoreTransfer(transferId, transfer, actorId, 'Получатель не получил ничего');
    }

    for (const [itemType, sentQty] of sentMap) {
      const receivedQty = receivedMap.get(itemType) ?? 0;
      if (receivedQty !== sentQty) {
        hasDiscrepancy = true;
        break;
      }
    }

    const newStatus = hasDiscrepancy ? TransferStatus.DISCREPANCY_FOUND : TransferStatus.ACCEPTED;

    const result = await this.prisma.$transaction(async (tx) => {
      // Check version still SENT (optimistic)
      const updated = await tx.transfer.updateMany({
        where: { id: transferId, status: TransferStatus.SENT },
        data: { status: newStatus, acceptedBy: actorId, acceptedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException('Статус перевода изменился, повторите попытку');
      }

      if (newStatus === TransferStatus.ACCEPTED) {
        // Credit receiver
        const creditData: Record<string, any> = {};
        for (const [itemType, sentQty] of sentMap) {
          const color = ITEM_TO_COLOR[itemType];
          if (color) creditData[balanceField(color)] = { increment: sentQty };
        }
        await tx.user.update({ where: { id: transfer.toUserId! }, data: creditData });

        // Store acceptance records
        for (const item of transfer.items) {
          await tx.acceptanceRecord.create({
            data: {
              transferId,
              itemType: item.itemType,
              sentQuantity: item.quantity,
              receivedQuantity: receivedMap.get(item.itemType) ?? 0,
              discrepancy: item.quantity - (receivedMap.get(item.itemType) ?? 0),
              acceptedById: actorId,
            },
          });
        }

        await this.writeTransferAudit(tx, AuditAction.TRANSFER_ACCEPTED, transferId, actorId, {
          receivedItems,
        });

        if (transfer.fromUser?.primaryCityId) {
          await this.inventoryService.updateCityStatus(tx, transfer.fromUser.primaryCityId);
        }
        if (transfer.toUser?.primaryCityId) {
          await this.inventoryService.updateCityStatus(tx, transfer.toUser.primaryCityId);
        }
      } else {
        // DISCREPANCY_FOUND — store acceptance records for review
        for (const item of transfer.items) {
          await tx.acceptanceRecord.create({
            data: {
              transferId,
              itemType: item.itemType,
              sentQuantity: item.quantity,
              receivedQuantity: receivedMap.get(item.itemType) ?? 0,
              discrepancy: item.quantity - (receivedMap.get(item.itemType) ?? 0),
              acceptedById: actorId,
            },
          });
        }

        await this.writeTransferAudit(tx, AuditAction.DISCREPANCY_DETECTED, transferId, actorId, {
          receivedItems,
        });
      }

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, fromUser: userInclude, toUser: userInclude, acceptanceRecords: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.redis.del(`balance:user:${transfer.fromUserId!}`);
    await this.redis.del(`balance:user:${transfer.toUserId!}`);

    this.eventEmitter.emit('transfer.accepted', { transferId, actorId });

    return result;
  }

  // -------------------------------------------------------------------------
  // REJECT
  // -------------------------------------------------------------------------

  async rejectTransfer(transferId: string, reason: string, actorId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Перевод не найден');
    if (transfer.status !== TransferStatus.SENT) {
      throw new BadRequestException(`Нельзя отклонить перевод со статусом ${transfer.status}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Restore sender balance
      const restoreData: Record<string, any> = { balanceVersion: { increment: 1 } };
      for (const item of transfer.items) {
        const color = ITEM_TO_COLOR[item.itemType];
        if (color) restoreData[balanceField(color)] = { increment: item.quantity };
      }
      await tx.user.update({ where: { id: transfer.fromUserId! }, data: restoreData });

      await tx.transfer.update({
        where: { id: transferId },
        data: { status: TransferStatus.REJECTED, rejectedBy: actorId, rejectedAt: new Date() },
      });

      await tx.transferRejection.create({
        data: { transferId, rejectedBy: actorId, reason },
      });

      await this.writeTransferAudit(tx, AuditAction.TRANSFER_REJECTED, transferId, actorId, { reason });

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, fromUser: userInclude, toUser: userInclude },
      });
    });

    await this.redis.del(`balance:user:${transfer.fromUserId!}`);

    this.eventEmitter.emit('transfer.rejected', { transferId, actorId });

    return result;
  }

  // -------------------------------------------------------------------------
  // CANCEL
  // -------------------------------------------------------------------------

  async cancelTransfer(transferId: string, actorId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Перевод не найден');

    const nonCancellableStatuses = [
      TransferStatus.ACCEPTED,
      TransferStatus.DISCREPANCY_FOUND,
      TransferStatus.REJECTED,
      TransferStatus.CANCELLED,
    ];
    if ((nonCancellableStatuses as TransferStatus[]).includes(transfer.status)) {
      throw new BadRequestException(`Нельзя отменить перевод со статусом ${transfer.status}`);
    }

    return this._cancelAndRestoreTransfer(transferId, transfer, actorId, 'Отменено');
  }

  private async _cancelAndRestoreTransfer(
    transferId: string,
    transfer: any,
    actorId: string,
    _reason: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const restoreData: Record<string, any> = { balanceVersion: { increment: 1 } };
      for (const item of transfer.items) {
        const color = ITEM_TO_COLOR[item.itemType];
        if (color) restoreData[balanceField(color)] = { increment: item.quantity };
      }
      await tx.user.update({ where: { id: transfer.fromUserId! }, data: restoreData });

      await tx.transfer.update({
        where: { id: transferId },
        data: { status: TransferStatus.CANCELLED, cancelledBy: actorId, cancelledAt: new Date() },
      });

      await this.writeTransferAudit(tx, AuditAction.TRANSFER_CANCELLED, transferId, actorId, {});

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, fromUser: userInclude, toUser: userInclude },
      });
    });

    await this.redis.del(`balance:user:${transfer.fromUserId!}`);

    this.eventEmitter.emit('transfer.cancelled', { transferId, actorId });

    return result;
  }

  // -------------------------------------------------------------------------
  // RESOLVE DISCREPANCY
  // -------------------------------------------------------------------------

  async resolveDiscrepancy(transferId: string, dto: ResolveDiscrepancyDto, actorId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: true,
        acceptanceRecords: true,
        fromUser: { select: { id: true, primaryCityId: true, displayName: true } },
        toUser: { select: { id: true, primaryCityId: true, displayName: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Перевод не найден');
    if (transfer.status !== TransferStatus.DISCREPANCY_FOUND) {
      throw new BadRequestException('Перевод не находится в статусе расхождения');
    }

    const { resolutionType, compromiseValues, notes } = dto;

    // Build final per-color quantities from compromise values or acceptance records
    const finalByColor: Partial<Record<BalanceColor, number>> = {};
    if (compromiseValues) {
      if (compromiseValues.black) finalByColor['Black'] = compromiseValues.black;
      if (compromiseValues.white) finalByColor['White'] = compromiseValues.white;
      if (compromiseValues.red) finalByColor['Red'] = compromiseValues.red;
      if (compromiseValues.blue) finalByColor['Blue'] = compromiseValues.blue;
    } else {
      // Use received quantities from acceptance records
      for (const ar of transfer.acceptanceRecords) {
        const color = ITEM_TO_COLOR[ar.itemType];
        if (color) finalByColor[color] = (finalByColor[color] ?? 0) + ar.receivedQuantity;
      }
    }

    const sentByColor: Partial<Record<BalanceColor, number>> = {};
    for (const item of transfer.items) {
      const color = ITEM_TO_COLOR[item.itemType];
      if (color) sentByColor[color] = (sentByColor[color] ?? 0) + item.quantity;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (resolutionType === 'CANCEL_TRANSFER') {
        // Restore all to sender
        const restoreData: Record<string, any> = { balanceVersion: { increment: 1 } };
        for (const item of transfer.items) {
          const color = ITEM_TO_COLOR[item.itemType];
          if (color) restoreData[balanceField(color)] = { increment: item.quantity };
        }
        await tx.user.update({ where: { id: transfer.fromUserId! }, data: restoreData });

        // Record as company loss
        await tx.companyLoss.create({
          data: {
            transferId,
            resolutionType: resolutionType as any,
            senderName: transfer.fromUser?.displayName || '—',
            receiverName: transfer.toUser?.displayName || '—',
            originalSent: transfer.items.reduce((s, i) => s + i.quantity, 0),
            originalReceived: transfer.acceptanceRecords.reduce((s, r) => s + r.receivedQuantity, 0),
            black: sentByColor['Black'] ?? 0,
            white: sentByColor['White'] ?? 0,
            red: sentByColor['Red'] ?? 0,
            blue: sentByColor['Blue'] ?? 0,
            totalAmount: Object.values(sentByColor).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0,
            resolvedBy: actorId,
            notes: notes ?? null,
          },
        });

        await tx.transfer.update({
          where: { id: transferId },
          data: {
            status: TransferStatus.CANCELLED,
            cancelledBy: actorId,
            cancelledAt: new Date(),
            discrepancyNotes: notes,
          },
        });
      } else {
        // Credit receiver with final quantities
        if (Object.keys(finalByColor).length > 0) {
          const creditData: Record<string, any> = { balanceVersion: { increment: 1 } };
          for (const [color, qty] of Object.entries(finalByColor) as [BalanceColor, number][]) {
            if (qty > 0) creditData[balanceField(color)] = { increment: qty };
          }
          await tx.user.update({ where: { id: transfer.toUserId! }, data: creditData });
        }

        // Compute shortage per-user
        const shortageByColor: Partial<Record<BalanceColor, number>> = {};
        for (const [color, sentQty] of Object.entries(sentByColor) as [BalanceColor, number][]) {
          const finalQty = finalByColor[color] ?? 0;
          const diff = sentQty - finalQty;
          if (diff > 0) shortageByColor[color] = diff;
        }
        const totalShortage = Object.values(shortageByColor).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;

        if (totalShortage > 0) {
          if (resolutionType === 'ACCEPT_SENDER') {
            // Receiver blamed
            await tx.shortage.create({
              data: {
                userId: transfer.toUserId!,
                transferId,
                black: shortageByColor['Black'] ?? 0,
                white: shortageByColor['White'] ?? 0,
                red: shortageByColor['Red'] ?? 0,
                blue: shortageByColor['Blue'] ?? 0,
                totalAmount: totalShortage,
                reason: 'RECEIVER_BLAMED',
                resolutionType,
                resolvedBy: actorId,
                notes,
              },
            });
          } else if (resolutionType === 'ACCEPT_RECEIVER') {
            // Sender blamed
            await tx.shortage.create({
              data: {
                userId: transfer.fromUserId!,
                transferId,
                black: shortageByColor['Black'] ?? 0,
                white: shortageByColor['White'] ?? 0,
                red: shortageByColor['Red'] ?? 0,
                blue: shortageByColor['Blue'] ?? 0,
                totalAmount: totalShortage,
                reason: 'SENDER_BLAMED',
                resolutionType,
                resolvedBy: actorId,
                notes,
              },
            });
          } else if (resolutionType === 'ACCEPT_COMPROMISE') {
            // Both blamed equally (split evenly)
            const half = Math.floor(totalShortage / 2);
            await tx.shortage.createMany({
              data: [
                {
                  userId: transfer.fromUserId!,
                  transferId,
                  black: Math.floor((shortageByColor['Black'] ?? 0) / 2),
                  white: Math.floor((shortageByColor['White'] ?? 0) / 2),
                  red: Math.floor((shortageByColor['Red'] ?? 0) / 2),
                  blue: Math.floor((shortageByColor['Blue'] ?? 0) / 2),
                  totalAmount: half,
                  reason: 'SENDER_BLAMED',
                  resolutionType,
                  resolvedBy: actorId,
                  notes,
                },
                {
                  userId: transfer.toUserId!,
                  transferId,
                  black: (shortageByColor['Black'] ?? 0) - Math.floor((shortageByColor['Black'] ?? 0) / 2),
                  white: (shortageByColor['White'] ?? 0) - Math.floor((shortageByColor['White'] ?? 0) / 2),
                  red: (shortageByColor['Red'] ?? 0) - Math.floor((shortageByColor['Red'] ?? 0) / 2),
                  blue: (shortageByColor['Blue'] ?? 0) - Math.floor((shortageByColor['Blue'] ?? 0) / 2),
                  totalAmount: totalShortage - half,
                  reason: 'RECEIVER_BLAMED',
                  resolutionType,
                  resolvedBy: actorId,
                  notes,
                },
              ],
            });
          } else {
            // ACCEPT_AS_IS > company loss
            await tx.companyLoss.create({
              data: {
                transferId,
                resolutionType: resolutionType as any,
                senderName: transfer.fromUser?.displayName || '—',
                receiverName: transfer.toUser?.displayName || '—',
                originalSent: transfer.items.reduce((s, i) => s + i.quantity, 0),
                originalReceived: transfer.acceptanceRecords.reduce((s, r) => s + r.receivedQuantity, 0),
                black: shortageByColor['Black'] ?? 0,
                white: shortageByColor['White'] ?? 0,
                red: shortageByColor['Red'] ?? 0,
                blue: shortageByColor['Blue'] ?? 0,
                totalAmount: totalShortage,
                resolvedBy: actorId,
                notes: notes ?? null,
              },
            });
          }
        }

        await tx.transfer.update({
          where: { id: transferId },
          data: {
            status: TransferStatus.ACCEPTED,
            resolvedBy: actorId,
            resolvedAt: new Date(),
            discrepancyNotes: notes,
          },
        });
      }

      await this.writeTransferAudit(tx, AuditAction.DISCREPANCY_DETECTED, transferId, actorId, {
        resolutionType,
        compromiseValues,
      });

      if (transfer.fromUser?.primaryCityId) {
        await this.inventoryService.updateCityStatus(tx, transfer.fromUser.primaryCityId);
      }
      if (transfer.toUser?.primaryCityId) {
        await this.inventoryService.updateCityStatus(tx, transfer.toUser.primaryCityId);
      }

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, acceptanceRecords: true, fromUser: userInclude, toUser: userInclude },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.redis.del(`balance:user:${transfer.fromUserId!}`);
    await this.redis.del(`balance:user:${transfer.toUserId!}`);

    return result;
  }

  // -------------------------------------------------------------------------
  // EDIT TRANSFER (ADMIN only, SENT transfers)
  // -------------------------------------------------------------------------

  async editTransfer(
    transferId: string,
    newItems: Array<{ itemType: ItemType; quantity: number }>,
    actorId: string,
    notes?: string,
  ) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Перевод не найден');
    if (transfer.status !== TransferStatus.SENT) {
      throw new BadRequestException('Редактировать можно только переводы в статусе SENT');
    }

    const fromUser = await this.prisma.user.findUnique({
      where: { id: transfer.fromUserId! },
      select: {
        balanceBlack: true,
        balanceWhite: true,
        balanceRed: true,
        balanceBlue: true,
        balanceVersion: true,
      },
    });
    if (!fromUser) throw new NotFoundException('Отправитель не найден');

    // Compute delta per color: positive = need to deduct more, negative = can restore
    const oldColorTotals: Partial<Record<BalanceColor, number>> = {};
    for (const item of transfer.items) {
      const color = ITEM_TO_COLOR[item.itemType];
      if (color) oldColorTotals[color] = (oldColorTotals[color] ?? 0) + item.quantity;
    }

    const newColorTotals: Partial<Record<BalanceColor, number>> = {};
    for (const item of newItems) {
      const color = ITEM_TO_COLOR[item.itemType];
      if (!color) throw new BadRequestException(`Неизвестный тип: ${item.itemType}`);
      newColorTotals[color] = (newColorTotals[color] ?? 0) + item.quantity;
    }

    // Validate increases
    const colors: BalanceColor[] = ['Black', 'White', 'Red', 'Blue'];
    for (const color of colors) {
      const oldQty = oldColorTotals[color] ?? 0;
      const newQty = newColorTotals[color] ?? 0;
      const delta = newQty - oldQty;
      if (delta > 0) {
        const field = balanceField(color);
        if ((fromUser[field] as number) < delta) {
          throw new BadRequestException(`Недостаточно баланса для увеличения (${color})`);
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Adjust sender balance
      const adjustData: Record<string, any> = { balanceVersion: { increment: 1 } };
      for (const color of colors) {
        const oldQty = oldColorTotals[color] ?? 0;
        const newQty = newColorTotals[color] ?? 0;
        const delta = newQty - oldQty;
        if (delta !== 0) {
          adjustData[balanceField(color)] = delta > 0 ? { decrement: delta } : { increment: -delta };
        }
      }
      await tx.user.update({ where: { id: transfer.fromUserId! }, data: adjustData });

      // Replace items
      await tx.transferItem.deleteMany({ where: { transferId } });
      await tx.transfer.update({
        where: { id: transferId },
        data: {
          notes: notes ?? transfer.notes,
          items: { create: newItems.map((i) => ({ itemType: i.itemType, quantity: i.quantity })) },
        },
      });

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, fromUser: userInclude, toUser: userInclude },
      });
    });

    await this.redis.del(`balance:user:${transfer.fromUserId!}`);

    return result;
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  async findAll(params: {
    status?: TransferStatus;
    page?: number;
    limit?: number;
    direction?: 'sent' | 'received';
    countryId?: string;
    cityId?: string;
    userId?: string;
    userRole?: Role;
    userPrimaryCityId?: string;
  }) {
    const {
      status,
      page = 1,
      limit = 20,
      direction,
      countryId,
      cityId,
      userId,
      userRole,
      userPrimaryCityId,
    } = params;

    const where: Prisma.TransferWhereInput = {};

    if (status) where.status = status;

    // Geography filters
    if (cityId) {
      where.OR = [
        { fromUser: { primaryCityId: cityId } },
        { toUser: { primaryCityId: cityId } },
      ];
    } else if (countryId) {
      where.OR = [
        { fromUser: { primaryCity: { countryId } } },
        { toUser: { primaryCity: { countryId } } },
      ];
    }

    // Role-based filters
    if (userRole === Role.USER && userId) {
      const userFilter: Prisma.TransferWhereInput =
        direction === 'sent'
          ? { fromUserId: userId }
          : direction === 'received'
          ? { toUserId: userId }
          : { OR: [{ fromUserId: userId }, { toUserId: userId }] };

      // Merge with existing where
      if (where.OR) {
        where.AND = [{ OR: where.OR as any }, userFilter];
        delete where.OR;
      } else {
        Object.assign(where, userFilter);
      }
    } else if (userRole === Role.OFFICE && userPrimaryCityId) {
      // OFFICE sees transfers in their primary city
      const cityFilter: Prisma.TransferWhereInput = {
        OR: [
          { fromUser: { primaryCityId: userPrimaryCityId } },
          { toUser: { primaryCityId: userPrimaryCityId } },
        ],
      };
      if (!cityId && !countryId) {
        Object.assign(where, cityFilter);
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          fromUser: userInclude,
          toUser: userInclude,
        },
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return { transfers, total, page: Number(page), limit: Number(limit) };
  }

  async findById(transferId: string, currentUser?: any) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: true,
        acceptanceRecords: true,
        fromUser: userInclude,
        toUser: userInclude,
        rejection: true,
      },
    });
    if (!transfer) throw new NotFoundException('Перевод не найден');

    // USER can only view their own transfers
    if (currentUser?.role === Role.USER) {
      if (transfer.fromUserId! !== currentUser.id && transfer.toUserId! !== currentUser.id) {
        throw new ForbiddenException('Нет доступа к этому переводу');
      }
      // Blind acceptance: hide sent quantities from receiver when status=SENT
      if (transfer.status === TransferStatus.SENT && transfer.toUserId! === currentUser.id) {
        return {
          ...transfer,
          items: (transfer.items as any[]).map((i: any) => ({ ...i, quantity: null })),
        };
      }
    }

    return transfer;
  }

  async getPendingIncoming(params: { userId?: string; userRole?: Role }) {
    const { userId, userRole } = params;

    const where: Prisma.TransferWhereInput = { status: TransferStatus.SENT };

    if (userRole === Role.USER && userId) {
      where.toUserId = userId;
    }
    // ADMIN/OFFICE see all pending

    return this.prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        items: true,
        fromUser: userInclude,
        toUser: userInclude,
      },
    });
  }

  async findProblematic(params: {
    page?: number;
    limit?: number;
    countryId?: string;
    cityId?: string;
    userRole?: Role;
    userPrimaryCityId?: string;
  }) {
    const { page = 1, limit = 20, countryId, cityId, userRole, userPrimaryCityId } = params;

    const where: Prisma.TransferWhereInput = {
      status: {
        in: [TransferStatus.DISCREPANCY_FOUND],
      },
    };

    if (cityId) {
      where.OR = [
        { fromUser: { primaryCityId: cityId } },
        { toUser: { primaryCityId: cityId } },
      ];
    } else if (countryId) {
      where.OR = [
        { fromUser: { primaryCity: { countryId } } },
        { toUser: { primaryCity: { countryId } } },
      ];
    } else if (userRole === Role.OFFICE && userPrimaryCityId) {
      where.OR = [
        { fromUser: { primaryCityId: userPrimaryCityId } },
        { toUser: { primaryCityId: userPrimaryCityId } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          acceptanceRecords: true,
          fromUser: userInclude,
          toUser: userInclude,
        },
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return { transfers, total, page: Number(page), limit: Number(limit) };
  }

  async getStats(params: {
    period?: 'week' | 'month' | 'quarter' | 'year';
    countryId?: string;
    cityId?: string;
    userRole?: Role;
    userPrimaryCityId?: string;
  }) {
    const { period = 'month', countryId, cityId } = params;

    const periodStart = this._periodStart(period);

    const transferWhere: Prisma.TransferWhereInput = { createdAt: { gte: periodStart } };
    if (cityId) {
      transferWhere.OR = [
        { fromUser: { primaryCityId: cityId } },
        { toUser: { primaryCityId: cityId } },
      ];
    } else if (countryId) {
      transferWhere.OR = [
        { fromUser: { primaryCity: { countryId } } },
        { toUser: { primaryCity: { countryId } } },
      ];
    }

    const userBalanceWhere: Prisma.UserWhereInput = {
      role: Role.USER,
      isActive: true,
    };
    if (cityId) userBalanceWhere.primaryCityId = cityId;
    else if (countryId) userBalanceWhere.primaryCity = { countryId };

    const [
      totalTransfers,
      acceptedTransfers,
      discrepancyTransfers,
      cancelledTransfers,
      balanceAgg,
      totalCreated,
      activeUsersCount,
    ] = await Promise.all([
      this.prisma.transfer.count({ where: transferWhere }),
      this.prisma.transfer.count({ where: { ...transferWhere, status: TransferStatus.ACCEPTED } }),
      this.prisma.transfer.count({ where: { ...transferWhere, status: TransferStatus.DISCREPANCY_FOUND } }),
      this.prisma.transfer.count({ where: { ...transferWhere, status: TransferStatus.CANCELLED } }),
      this.prisma.user.aggregate({
        where: userBalanceWhere,
        _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
      }),
      this.prisma.warehouseCreation.aggregate({
        _sum: { black: true, white: true, red: true, blue: true, totalAmount: true },
        where: cityId
          ? { recipientUser: { primaryCityId: cityId } }
          : countryId
          ? { recipientUser: { primaryCity: { countryId } } }
          : undefined,
      }),
      this.prisma.user.count({ where: userBalanceWhere }),
    ]);

    // Active cities: cities with at least one active USER
    const activeCitiesCount = await this.prisma.city.count({
      where: {
        primaryUsers: { some: { isActive: true, role: Role.USER } },
        ...(countryId ? { countryId } : {}),
      },
    });

    // Color distribution from user balances
    const balanceSums = balanceAgg._sum;
    const totalBracelets =
      (balanceSums.balanceBlack ?? 0) +
      (balanceSums.balanceWhite ?? 0) +
      (balanceSums.balanceRed ?? 0) +
      (balanceSums.balanceBlue ?? 0);

    // Top cities by balance
    const topCitiesRaw = await this.prisma.user.groupBy({
      by: ['primaryCityId'],
      where: { role: Role.USER, isActive: true, ...(cityId ? { primaryCityId: cityId } : {}), ...(countryId ? { primaryCity: { countryId } } : {}) },
      _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
      orderBy: { _sum: { balanceBlack: 'desc' } },
      take: 10,
    });

    const cityIds = topCitiesRaw.map((r) => r.primaryCityId).filter(Boolean) as string[];
    const cities = await this.prisma.city.findMany({
      where: { id: { in: cityIds } },
      select: { id: true, name: true, country: { select: { id: true, name: true } } },
    });
    const cityMap = new Map(cities.map((c) => [c.id, c]));

    const topCities = topCitiesRaw
      .filter((r) => r.primaryCityId)
      .map((r) => ({
        city: cityMap.get(r.primaryCityId!),
        totalBalance:
          (r._sum.balanceBlack ?? 0) +
          (r._sum.balanceWhite ?? 0) +
          (r._sum.balanceRed ?? 0) +
          (r._sum.balanceBlue ?? 0),
        black: r._sum.balanceBlack ?? 0,
        white: r._sum.balanceWhite ?? 0,
        red: r._sum.balanceRed ?? 0,
        blue: r._sum.balanceBlue ?? 0,
      }))
      .sort((a, b) => b.totalBalance - a.totalBalance);

    return {
      period,
      transfers: {
        total: totalTransfers,
        accepted: acceptedTransfers,
        discrepancy: discrepancyTransfers,
        cancelled: cancelledTransfers,
        pending: totalTransfers - acceptedTransfers - discrepancyTransfers - cancelledTransfers,
      },
      inventory: {
        totalBracelets,
        black: balanceSums.balanceBlack ?? 0,
        white: balanceSums.balanceWhite ?? 0,
        red: balanceSums.balanceRed ?? 0,
        blue: balanceSums.balanceBlue ?? 0,
        totalCreatedEver: totalCreated._sum.totalAmount ?? 0,
      },
      geography: {
        activeCities: activeCitiesCount,
        totalUsers: activeUsersCount,
      },
      topCities,
    };
  }

  // -------------------------------------------------------------------------
  // PRIVATE HELPERS
  // -------------------------------------------------------------------------

  private async writeTransferAudit(
    tx: Prisma.TransactionClient,
    action: AuditAction,
    transferId: string,
    actorId: string,
    metadata: Record<string, any>,
  ) {
    try {
      await tx.auditLog.create({
        data: {
          actorId,
          action,
          entityType: 'transfer',
          entityId: transferId,
          metadata,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit write failed for ${action} on ${transferId}: ${err}`);
    }
  }

  private _periodStart(period: string): Date {
    const now = new Date();
    switch (period) {
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'quarter':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'month':
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}

