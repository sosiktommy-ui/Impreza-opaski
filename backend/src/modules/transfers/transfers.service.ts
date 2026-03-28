import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TransferStatus,
  EntityType,
  ItemType,
  Prisma,
} from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';

export interface SendTransferInput {
  senderType: EntityType;
  senderOfficeId?: string;
  senderCountryId?: string;
  senderCityId?: string;
  receiverType: EntityType;
  receiverOfficeId?: string;
  receiverCountryId?: string;
  receiverCityId?: string;
  items: Array<{ itemType: ItemType; quantity: number }>;
  notes?: string;
  createdBy: string;
}

export interface AcceptanceItem {
  itemType: ItemType;
  receivedQuantity: number;
}

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly inventoryService: InventoryService,
  ) {}

  // ──────────────────────────────────────────────
  // SEND TRANSFER (create + send in one step)
  // Admin creates bracelets from nothing (no inventory deduction)
  // Country/City deducts from own inventory
  // ──────────────────────────────────────────────

  async sendTransfer(input: SendTransferInput) {
    if (this.isSameEntity(input)) {
      throw new BadRequestException('Cannot send to yourself');
    }

    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(`Quantity must be positive for ${item.itemType}`);
      }
    }

    // CITY can only return bracelets to its own COUNTRY
    if (input.senderType === EntityType.CITY) {
      if (input.receiverType !== EntityType.COUNTRY) {
        throw new BadRequestException('City can only send bracelets back to a country');
      }
      if (!input.senderCityId) {
        throw new BadRequestException('Sender city ID is required for CITY sender');
      }
      const senderCity = await this.prisma.city.findUnique({
        where: { id: input.senderCityId },
        select: { countryId: true },
      });
      if (!senderCity) {
        throw new BadRequestException('Sender city not found');
      }
      if (input.receiverCountryId !== senderCity.countryId) {
        throw new BadRequestException('City can only return bracelets to its own country');
      }
    }

    const isAdminSender = input.senderType === EntityType.ADMIN;

    return this.prisma.$transaction(async (tx) => {
      // Check balance for ALL senders (including ADMIN)
      // This prevents sending more bracelets than available in inventory
      const entityId = input.senderType === EntityType.ADMIN
        ? null // ADMIN uses entityType: ADMIN with null IDs
        : input.senderType === EntityType.OFFICE
        ? (input.senderOfficeId || null)
        : input.senderType === EntityType.COUNTRY
        ? (input.senderCountryId || null)
        : (input.senderCityId || null);

      // Collect full balance for error message
      const fullBalance: Record<string, number> = {};
      for (const itemType of ['BLACK', 'WHITE', 'RED', 'BLUE'] as const) {
        fullBalance[itemType] = await this.getEntityBalance(
          tx,
          input.senderType,
          entityId,
          itemType as any,
        );
      }

      for (const item of input.items) {
        const balance = fullBalance[item.itemType];
        if (balance < item.quantity) {
          // Russian error message with full balance
          throw new BadRequestException(
            `Недостаточно браслетов. Баланс: Ч:${fullBalance.BLACK} Б:${fullBalance.WHITE} К:${fullBalance.RED} С:${fullBalance.BLUE}`,
          );
        }
      }

      // DEDUCT from sender immediately when transfer is created
      // This "freezes" the bracelets - they're no longer available to sender
      for (const item of input.items) {
        await this.deductInventory(
          tx,
          input.senderType,
          entityId,
          item.itemType,
          item.quantity,
        );
      }
      this.logger.log(`Transfer created: Deducted from sender ${input.senderType} (${entityId || 'ADMIN'}): ${JSON.stringify(input.items)}`);

      const transfer = await tx.transfer.create({
        data: {
          senderType: input.senderType,
          senderOfficeId: input.senderOfficeId || null,
          senderCountryId: input.senderCountryId || null,
          senderCityId: input.senderCityId || null,
          receiverType: input.receiverType,
          receiverOfficeId: input.receiverOfficeId || null,
          receiverCountryId: input.receiverCountryId || null,
          receiverCityId: input.receiverCityId || null,
          status: TransferStatus.SENT,
          createdBy: input.createdBy,
          sentAt: new Date(),
          notes: input.notes || null,
          items: {
            create: input.items.map((item) => ({
              itemType: item.itemType,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: true,
          senderOffice: { select: { id: true, name: true, code: true } },
          senderCountry: { select: { id: true, name: true, code: true } },
          senderCity: { select: { id: true, name: true, slug: true } },
          receiverOffice: { select: { id: true, name: true, code: true } },
          receiverCountry: { select: { id: true, name: true, code: true } },
          receiverCity: { select: { id: true, name: true, slug: true } },
        },
      });

      // No sender cache to invalidate (inventory not changed on send)

      // Invalidate sender cache since we deducted inventory
      if (entityId) {
        await this.redis.invalidateInventory(input.senderType, entityId);
      } else if (input.senderType === EntityType.ADMIN) {
        // ADMIN has no entityId but may have inventory cache
        await this.redis.invalidateInventory(EntityType.ADMIN, 'admin');
      }

      await this.storeDomainEvent(transfer.id, 'TransferSent', {
        transfer,
        actorId: input.createdBy,
      });

      this.logger.log(`Transfer ${transfer.id} created and sent`);

      const fromName = transfer.senderType === EntityType.ADMIN
        ? 'Админ'
        : (transfer.senderCity?.name || transfer.senderCountry?.name || 'Unknown');
      const toName = transfer.receiverCity?.name || transfer.receiverCountry?.name || 'Unknown';
      const fromEntityId = transfer.senderCityId || transfer.senderCountryId || '';
      const toEntityId = transfer.receiverCityId || transfer.receiverCountryId || '';

      // Fetch creator name for display
      const creator = await this.prisma.user.findUnique({
        where: { id: input.createdBy },
        select: { displayName: true, username: true },
      });

      this.eventEmitter.emit('transfer.sent', {
        transferId: transfer.id,
        fromEntityId,
        fromEntityType: transfer.senderType,
        fromEntityName: fromName,
        toEntityId,
        toEntityType: transfer.receiverType,
        toEntityName: toName,
        items: transfer.items.map((i) => ({ type: i.itemType, quantity: i.quantity })),
        actorId: input.createdBy,
        createdByName: creator?.displayName || creator?.username || 'Unknown',
      });

      return transfer;
    });
  }

  // ──────────────────────────────────────────────
  // ACCEPT TRANSFER — Blind Acceptance Flow
  // (SENT → ACCEPTED or DISCREPANCY_FOUND)
  // Receiver submits what they counted WITHOUT seeing sent quantities
  // ──────────────────────────────────────────────

  async acceptTransfer(
    transferId: string,
    receivedItems: AcceptanceItem[],
    actorId: string,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const transfer = await tx.transfer.findUnique({
          where: { id: transferId },
          include: { items: true },
        });

        if (!transfer) throw new NotFoundException(`Transfer ${transferId} not found`);

        if (transfer.status !== TransferStatus.SENT) {
          throw new ConflictException(
            `Cannot accept transfer in status ${transfer.status}. Must be SENT.`,
          );
        }

        // Build a map of sent quantities by item type
        const sentMap = new Map<ItemType, number>();
        for (const item of transfer.items) {
          sentMap.set(item.itemType, item.quantity);
        }

        // Validate that received items match the transfer's item types
        for (const ri of receivedItems) {
          if (!sentMap.has(ri.itemType)) {
            throw new BadRequestException(
              `Item type ${ri.itemType} was not in this transfer`,
            );
          }
        }

        // Check all sent item types are covered
        for (const [itemType] of sentMap) {
          if (!receivedItems.find((ri) => ri.itemType === itemType)) {
            throw new BadRequestException(
              `You must report received quantity for ${itemType}`,
            );
          }
        }

        // Create acceptance records & check for discrepancies
        let hasDiscrepancy = false;
        const records: Array<{
          itemType: ItemType;
          sentQuantity: number;
          receivedQuantity: number;
          discrepancy: number;
        }> = [];

        for (const ri of receivedItems) {
          const sentQty = sentMap.get(ri.itemType)!;
          const disc = sentQty - ri.receivedQuantity;
          if (disc !== 0) hasDiscrepancy = true;

          records.push({
            itemType: ri.itemType,
            sentQuantity: sentQty,
            receivedQuantity: ri.receivedQuantity,
            discrepancy: disc,
          });

          await tx.acceptanceRecord.create({
            data: {
              transferId,
              itemType: ri.itemType,
              sentQuantity: sentQty,
              receivedQuantity: ri.receivedQuantity,
              discrepancy: disc,
              acceptedById: actorId,
            },
          });
        }

        const newStatus = hasDiscrepancy
          ? TransferStatus.DISCREPANCY_FOUND
          : TransferStatus.ACCEPTED;

        // If all received quantities are zero → treat as CANCELLED (nothing received)
        const allZero = receivedItems.every((ri) => ri.receivedQuantity === 0);
        const finalStatus = allZero ? TransferStatus.CANCELLED : newStatus;

        // Optimistic lock via version
        const lockResult = await tx.transfer.updateMany({
          where: {
            id: transferId,
            version: transfer.version,
            status: TransferStatus.SENT,
          },
          data: {
            status: finalStatus,
            acceptedAt: new Date(),
            version: transfer.version + 1,
          },
        });

        if (lockResult.count === 0) {
          throw new ConflictException(
            'Transfer was modified by another process. Please retry.',
          );
        }

        // BALANCE LOGIC (sender was already deducted on send!):
        // - CANCELLED (all zero) → Return all bracelets to sender
        // - DISCREPANCY_FOUND → Wait for admin resolution
        // - ACCEPTED → Credit receiver (sender already deducted)
        const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
        const receiverEntityId = transfer.receiverOfficeId || transfer.receiverCountryId || transfer.receiverCityId;
        
        if (finalStatus === TransferStatus.CANCELLED) {
          // All zeros — return bracelets to sender (they were deducted on send)
          for (const item of transfer.items) {
            await this.creditInventory(
              tx,
              transfer.senderType,
              senderEntityId,
              item.itemType,
              item.quantity,
            );
          }
          this.logger.log(`Transfer ${transferId} CANCELLED (all zeros): Returned ${transfer.items.length} items to sender`);
        } else if (finalStatus === TransferStatus.DISCREPANCY_FOUND) {
          // Nothing happens to balances — frozen until admin resolves
          // Sender's bracelets are still "in transit" (deducted but not credited anywhere)
          this.logger.log(`Transfer ${transferId} DISCREPANCY: Balances frozen until resolution`);
        } else {
          // ACCEPTED: Credit receiver only (sender was already deducted on send)
          for (const ri of receivedItems) {
            if (ri.receivedQuantity > 0) {
              await this.creditInventory(
                tx,
                transfer.receiverType,
                receiverEntityId,
                ri.itemType,
                ri.receivedQuantity,
              );
            }
          }
          this.logger.log(`Transfer ${transferId} ACCEPTED: Credited ${JSON.stringify(receivedItems)} to receiver`);
        }

        // Update city status for low stock / zero stock notifications
        if (transfer.senderType === EntityType.CITY && transfer.senderCityId) {
          await this.inventoryService.updateCityStatus(tx, transfer.senderCityId);
        }
        if (transfer.receiverType === EntityType.CITY && transfer.receiverCityId) {
          await this.inventoryService.updateCityStatus(tx, transfer.receiverCityId);
        }

        await this.storeDomainEvent(transferId, 'TransferAccepted', {
          previousStatus: TransferStatus.SENT,
          newStatus: finalStatus,
          actorId,
          records,
          hasDiscrepancy,
          allZero,
        });

        this.logger.log(`Transfer ${transferId} ${finalStatus}`);

        // Fetch names for event payloads
        const acceptor = await tx.user.findUnique({
          where: { id: actorId },
          select: { displayName: true, username: true },
        });
        const acceptedByName = acceptor?.displayName || acceptor?.username || 'Unknown';

        const fromEntityId = transfer.senderCityId || transfer.senderCountryId || '';
        const fromEntityType = transfer.senderType;
        const toEntityId = transfer.receiverCityId || transfer.receiverCountryId || '';
        const toEntityType = transfer.receiverType;

        // Resolve entity names
        let fromEntityName = 'Админ';
        if (transfer.senderType === EntityType.COUNTRY && transfer.senderCountryId) {
          const c = await tx.country.findUnique({ where: { id: transfer.senderCountryId }, select: { name: true } });
          fromEntityName = c?.name || 'Unknown';
        } else if (transfer.senderType === EntityType.CITY && transfer.senderCityId) {
          const c = await tx.city.findUnique({ where: { id: transfer.senderCityId }, select: { name: true } });
          fromEntityName = c?.name || 'Unknown';
        }
        let toEntityName = 'Unknown';
        if (transfer.receiverType === EntityType.COUNTRY && transfer.receiverCountryId) {
          const c = await tx.country.findUnique({ where: { id: transfer.receiverCountryId }, select: { name: true } });
          toEntityName = c?.name || 'Unknown';
        } else if (transfer.receiverType === EntityType.CITY && transfer.receiverCityId) {
          const c = await tx.city.findUnique({ where: { id: transfer.receiverCityId }, select: { name: true } });
          toEntityName = c?.name || 'Unknown';
        }

        const eventBase = {
          transferId,
          fromEntityId,
          fromEntityType,
          fromEntityName,
          toEntityId,
          toEntityType,
          toEntityName,
          actorId,
          acceptedByName,
        };

        if (allZero) {
          this.eventEmitter.emit('transfer.cancelled', eventBase);
        } else if (hasDiscrepancy) {
          this.eventEmitter.emit('transfer.discrepancy', {
            ...eventBase,
            records,
          });
        } else {
          this.eventEmitter.emit('transfer.accepted', eventBase);
        }

        return tx.transfer.findUnique({
          where: { id: transferId },
          include: { items: true, acceptanceRecords: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );

    // Invalidate caches AFTER the transaction commits
    // so that getBalance never caches stale pre-commit zeros
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
    });
    if (transfer) {
      if (transfer.senderType !== EntityType.ADMIN) {
        const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
        if (senderEntityId) {
          await this.redis.invalidateInventory(transfer.senderType, senderEntityId);
        }
      }
      const receiverEntityId = transfer.receiverOfficeId || transfer.receiverCountryId || transfer.receiverCityId;
      if (receiverEntityId) {
        await this.redis.invalidateInventory(transfer.receiverType, receiverEntityId);
      }
    }

    return result;
  }

  // ──────────────────────────────────────────────
  // REJECT TRANSFER
  // ──────────────────────────────────────────────

  async rejectTransfer(
    transferId: string,
    reason: string,
    actorId: string,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true },
      });

      if (!transfer) throw new NotFoundException(`Transfer ${transferId} not found`);

      if (transfer.status !== TransferStatus.SENT) {
        throw new BadRequestException(
          `Cannot reject transfer in status ${transfer.status}. Must be SENT.`,
        );
      }

      await tx.transfer.update({
        where: { id: transferId },
        data: {
          status: TransferStatus.REJECTED,
          version: transfer.version + 1,
        },
      });

      await tx.transferRejection.create({
        data: {
          transferId,
          reason: reason.trim(),
          rejectedBy: actorId,
        },
      });

      // RETURN bracelets to sender — they were deducted on send
      const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
      for (const item of transfer.items) {
        await this.creditInventory(
          tx,
          transfer.senderType,
          senderEntityId,
          item.itemType,
          item.quantity,
        );
      }
      this.logger.log(`Transfer ${transferId} REJECTED: Returned ${transfer.items.map(i => `${i.itemType}:${i.quantity}`).join(', ')} to sender`);

      await this.storeDomainEvent(transferId, 'TransferRejected', {
        previousStatus: TransferStatus.SENT,
        newStatus: TransferStatus.REJECTED,
        reason,
        actorId,
      });

      this.logger.log(`Transfer ${transferId} REJECTED: ${reason}`);

      // Resolve names for event
      const rejector = await tx.user.findUnique({
        where: { id: actorId },
        select: { displayName: true, username: true },
      });
      const rejectedByName = rejector?.displayName || rejector?.username || 'Unknown';
      const fromEntityId = transfer.senderCityId || transfer.senderCountryId || '';
      const fromEntityType = transfer.senderType;
      let fromEntityName = 'Админ';
      if (transfer.senderType === EntityType.COUNTRY && transfer.senderCountryId) {
        const c = await tx.country.findUnique({ where: { id: transfer.senderCountryId }, select: { name: true } });
        fromEntityName = c?.name || 'Unknown';
      } else if (transfer.senderType === EntityType.CITY && transfer.senderCityId) {
        const c = await tx.city.findUnique({ where: { id: transfer.senderCityId }, select: { name: true } });
        fromEntityName = c?.name || 'Unknown';
      }

      this.eventEmitter.emit('transfer.rejected', {
        transferId,
        fromEntityId,
        fromEntityType,
        fromEntityName,
        rejectedByName,
        reason,
        actorId,
      });

      // Invalidate sender cache since we returned bracelets
      if (senderEntityId) {
        await this.redis.invalidateInventory(transfer.senderType, senderEntityId);
      } else if (transfer.senderType === EntityType.ADMIN) {
        await this.redis.invalidateInventory(EntityType.ADMIN, 'admin');
      }

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, rejection: true },
      });
    });
  }

  // ──────────────────────────────────────────────
  // CANCEL TRANSFER
  // ──────────────────────────────────────────────

  async cancelTransfer(transferId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true },
      });

      if (!transfer) throw new NotFoundException(`Transfer ${transferId} not found`);

      if (transfer.status === TransferStatus.ACCEPTED || transfer.status === TransferStatus.DISCREPANCY_FOUND) {
        throw new BadRequestException('Cannot cancel an accepted transfer');
      }

      if (
        transfer.status === TransferStatus.REJECTED ||
        transfer.status === TransferStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `Transfer is already ${transfer.status}`,
        );
      }

      // RETURN bracelets to sender — they were deducted on send
      const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
      for (const item of transfer.items) {
        await this.creditInventory(
          tx,
          transfer.senderType,
          senderEntityId,
          item.itemType,
          item.quantity,
        );
      }
      this.logger.log(`Transfer ${transferId} CANCELLED: Returned ${transfer.items.map(i => `${i.itemType}:${i.quantity}`).join(', ')} to sender`);

      await tx.transfer.update({
        where: { id: transferId },
        data: {
          status: TransferStatus.CANCELLED,
          version: transfer.version + 1,
        },
      });

      await this.storeDomainEvent(transferId, 'TransferCancelled', {
        previousStatus: transfer.status,
        newStatus: TransferStatus.CANCELLED,
        actorId,
      });

      this.logger.log(`Transfer ${transferId} CANCELLED`);

      // Resolve names for event
      const canceller = await tx.user.findUnique({
        where: { id: actorId },
        select: { displayName: true, username: true },
      });
      const fromEntityId = transfer.senderCityId || transfer.senderCountryId || '';
      const toEntityId = transfer.receiverCityId || transfer.receiverCountryId || '';

      // Resolve entity names
      let fromEntityName = 'Unknown';
      if (transfer.senderType === EntityType.COUNTRY && transfer.senderCountryId) {
        const c = await tx.country.findUnique({ where: { id: transfer.senderCountryId }, select: { name: true } });
        fromEntityName = c?.name || 'Unknown';
      } else if (transfer.senderType === EntityType.CITY && transfer.senderCityId) {
        const c = await tx.city.findUnique({ where: { id: transfer.senderCityId }, select: { name: true } });
        fromEntityName = c?.name || 'Unknown';
      } else if (transfer.senderType === EntityType.OFFICE && transfer.senderOfficeId) {
        const o = await tx.office.findUnique({ where: { id: transfer.senderOfficeId }, select: { name: true } });
        fromEntityName = o?.name || 'Склад';
      } else if (transfer.senderType === EntityType.ADMIN) {
        fromEntityName = 'Склад';
      }
      let toEntityName = 'Unknown';
      if (transfer.receiverType === EntityType.COUNTRY && transfer.receiverCountryId) {
        const c = await tx.country.findUnique({ where: { id: transfer.receiverCountryId }, select: { name: true } });
        toEntityName = c?.name || 'Unknown';
      } else if (transfer.receiverType === EntityType.CITY && transfer.receiverCityId) {
        const c = await tx.city.findUnique({ where: { id: transfer.receiverCityId }, select: { name: true } });
        toEntityName = c?.name || 'Unknown';
      }

      this.eventEmitter.emit('transfer.cancelled', {
        transferId,
        fromEntityId,
        fromEntityType: transfer.senderType,
        fromEntityName,
        toEntityId,
        toEntityType: transfer.receiverType,
        toEntityName,
        actorId,
        cancelledByName: canceller?.displayName || canceller?.username || 'Unknown',
      });

      // Invalidate sender cache since we returned bracelets
      if (senderEntityId) {
        await this.redis.invalidateInventory(transfer.senderType, senderEntityId);
      } else if (transfer.senderType === EntityType.ADMIN) {
        await this.redis.invalidateInventory(EntityType.ADMIN, 'admin');
      }

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true },
      });
    });
  }

  // ──────────────────────────────────────────────
  // QUERIES
  // ──────────────────────────────────────────────

  async findAll(params: {
    status?: TransferStatus;
    page?: number;
    limit?: number;
    direction?: 'sent' | 'received';
    countryId?: string;
    cityId?: string;
    userRole?: string;
    userId?: string;
    userCountryId?: string;
    userCityId?: string;
    userOfficeId?: string;
  }) {
    const {
      status,
      page = 1,
      limit = 20,
      direction,
      countryId,
      cityId,
      userRole,
      userId,
      userCountryId,
      userCityId,
      userOfficeId,
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {};

    if (status) where.status = status;

    // Explicit country/city filter from global filters (takes priority over RBAC scope)
    if (cityId) {
      where.AND = [
        ...(Array.isArray((where as any).AND) ? (where as any).AND : []),
        { OR: [
          { senderCityId: cityId },
          { receiverCityId: cityId },
        ]},
      ];
    } else if (countryId) {
      where.AND = [
        ...(Array.isArray((where as any).AND) ? (where as any).AND : []),
        { OR: [
          { senderCountryId: countryId },
          { receiverCountryId: countryId },
          { senderCity: { countryId } },
          { receiverCity: { countryId } },
        ]},
      ];
    }

    // Direction filter: 'sent' = user is sender, 'received' = user is receiver
    if (direction && userRole) {
      const directionConditions: Prisma.TransferWhereInput[] = [];

      if (direction === 'sent') {
        if (userRole === 'ADMIN') {
          directionConditions.push({ senderType: EntityType.ADMIN, createdBy: userId });
        } else if (userRole === 'OFFICE' && userOfficeId) {
          directionConditions.push({ senderType: EntityType.OFFICE, senderOfficeId: userOfficeId });
        } else if (userRole === 'COUNTRY' && userCountryId) {
          directionConditions.push({ senderType: EntityType.COUNTRY, senderCountryId: userCountryId });
        } else if (userRole === 'CITY' && userCityId) {
          directionConditions.push({ senderType: EntityType.CITY, senderCityId: userCityId });
        }
      } else if (direction === 'received') {
        if (userRole === 'ADMIN') {
          // Admin sees all incoming
        } else if (userRole === 'OFFICE' && userOfficeId) {
          const officeCountries = await this.prisma.country.findMany({
            where: { officeId: userOfficeId },
            select: { id: true },
          });
          const countryIds = officeCountries.map((c) => c.id);
          if (countryIds.length > 0) {
            directionConditions.push(
              { receiverType: EntityType.COUNTRY, receiverCountryId: { in: countryIds } },
              { receiverType: EntityType.CITY, receiverCity: { countryId: { in: countryIds } } },
            );
          }
        } else if (userRole === 'COUNTRY' && userCountryId) {
          directionConditions.push(
            { receiverType: EntityType.COUNTRY, receiverCountryId: userCountryId },
            { receiverType: EntityType.CITY, receiverCity: { countryId: userCountryId } },
          );
        } else if (userRole === 'CITY' && userCityId) {
          directionConditions.push({ receiverType: EntityType.CITY, receiverCityId: userCityId });
        }
      }

      if (directionConditions.length > 0) {
        where.OR = directionConditions;
      }
    } else {
      // No direction filter — apply standard RBAC scope
      if (userRole === 'COUNTRY' && userCountryId) {
        where.OR = [
          { senderType: EntityType.COUNTRY, senderCountryId: userCountryId },
          { receiverType: EntityType.COUNTRY, receiverCountryId: userCountryId },
          {
            senderType: EntityType.CITY,
            senderCity: { countryId: userCountryId },
          },
          {
            receiverType: EntityType.CITY,
            receiverCity: { countryId: userCountryId },
          },
        ];
      } else if (userRole === 'CITY' && userCityId) {
        where.OR = [
          { senderType: EntityType.CITY, senderCityId: userCityId },
          { receiverType: EntityType.CITY, receiverCityId: userCityId },
        ];
      } else if (userRole === 'OFFICE' && userOfficeId) {
        const officeCountries = await this.prisma.country.findMany({
          where: { officeId: userOfficeId },
          select: { id: true },
        });
        const countryIds = officeCountries.map((c) => c.id);
        if (countryIds.length > 0) {
          where.OR = [
            { senderType: EntityType.COUNTRY, senderCountryId: { in: countryIds } },
            { receiverType: EntityType.COUNTRY, receiverCountryId: { in: countryIds } },
            { senderType: EntityType.CITY, senderCity: { countryId: { in: countryIds } } },
            { receiverType: EntityType.CITY, receiverCity: { countryId: { in: countryIds } } },
          ];
        }
      }
    }

    const includeRelations = {
      items: true,
      rejection: true,
      acceptanceRecords: {
        include: {
          acceptedBy: { select: { id: true, displayName: true, username: true, role: true } },
        },
      },
      senderOffice: { select: { id: true, name: true, code: true } },
      senderCountry: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
      senderCity: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, country: { select: { id: true, name: true } } } },
      receiverOffice: { select: { id: true, name: true, code: true } },
      receiverCountry: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
      receiverCity: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, country: { select: { id: true, name: true } } } },
    };

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        include: includeRelations,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transfer.count({ where }),
    ]);

    // Enrich with creator info
    const creatorIds = [...new Set(transfers.map((t) => t.createdBy))];
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, displayName: true, username: true, role: true },
    });
    const creatorsMap = new Map(creators.map((c) => [c.id, c]));

    const enriched = transfers.map((t) => ({
      ...t,
      createdByUser: creatorsMap.get(t.createdBy) || null,
    }));

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(transferId: string, currentUser?: { role: string; countryId?: string | null; cityId?: string | null }) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: true,
        rejection: true,
        acceptanceRecords: {
          include: {
            acceptedBy: { select: { id: true, displayName: true, username: true, role: true } },
          },
        },
        senderOffice: { select: { id: true, name: true, code: true } },
      senderCountry: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
        senderCity: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, country: { select: { id: true, name: true } } } },
      receiverOffice: { select: { id: true, name: true, code: true } },
        receiverCountry: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
        receiverCity: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, country: { select: { id: true, name: true } } } },
      },
    });

    if (!transfer) throw new NotFoundException(`Transfer ${transferId} not found`);

    // Enrich with creator info
    const creator = await this.prisma.user.findUnique({
      where: { id: transfer.createdBy },
      select: { id: true, displayName: true, username: true, role: true },
    });
    const enrichedTransfer = { ...transfer, createdByUser: creator || null };

    // Blind acceptance: if transfer is SENT and current user is the receiver,
    // hide the sent quantities (they should only enter what they received)
    if (
      currentUser &&
      enrichedTransfer.status === TransferStatus.SENT &&
      this.isReceiver(enrichedTransfer, currentUser)
    ) {
      return {
        ...enrichedTransfer,
        items: enrichedTransfer.items.map((item) => ({
          ...item,
          quantity: undefined, // hide sent quantity from receiver
        })),
      };
    }

    return enrichedTransfer;
  }

  async getPendingIncoming(params: {
    entityType: EntityType;
    entityId: string;
    userRole: string;
  }) {
    const { entityType, entityId, userRole } = params;

    const where: Prisma.TransferWhereInput = {
      status: TransferStatus.SENT,
    };

    if (userRole === 'ADMIN') {
      // Admin sees all pending
    } else if (userRole === 'OFFICE') {
      // Office sees pending for countries/cities assigned to their office
      const officeCountries = await this.prisma.country.findMany({
        where: { officeId: entityId },
        select: { id: true },
      });
      const countryIds = officeCountries.map((c) => c.id);
      if (countryIds.length > 0) {
        where.OR = [
          { receiverType: EntityType.COUNTRY, receiverCountryId: { in: countryIds } },
          { receiverType: EntityType.CITY, receiverCity: { countryId: { in: countryIds } } },
          { senderType: EntityType.OFFICE, senderOfficeId: entityId },
        ];
      } else {
        // Office has no assigned countries — only see transfers from this office
        where.senderType = EntityType.OFFICE;
        where.senderOfficeId = entityId;
      }
    } else if (entityType === EntityType.COUNTRY) {
      where.OR = [
        { receiverType: EntityType.COUNTRY, receiverCountryId: entityId },
        {
          receiverType: EntityType.CITY,
          receiverCity: { countryId: entityId },
        },
      ];
    } else if (entityType === EntityType.CITY) {
      where.receiverType = EntityType.CITY;
      where.receiverCityId = entityId;
    }

    return this.prisma.transfer.findMany({
      where,
      include: {
        items: true,
        senderOffice: { select: { id: true, name: true, code: true } },
      senderCountry: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
        senderCity: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, country: { select: { id: true, name: true } } } },
      receiverOffice: { select: { id: true, name: true, code: true } },
        receiverCountry: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
        receiverCity: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, country: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────
  // PROBLEMATIC TRANSFERS (DISCREPANCY_FOUND)
  // ──────────────────────────────────────────────

  async findProblematic(params: {
    page?: number;
    limit?: number;
    countryId?: string;
    cityId?: string;
    userRole?: string;
    userCountryId?: string;
    userCityId?: string;
    userOfficeId?: string;
  }) {
    const { page = 1, limit = 20, countryId, cityId, userRole, userCountryId, userCityId, userOfficeId } = params;
    const skip = (page - 1) * limit;

    this.logger.log(`=== findProblematic START ===`);
    this.logger.log(`Params: ${JSON.stringify(params)}`);

    const where: Prisma.TransferWhereInput = {
      status: TransferStatus.DISCREPANCY_FOUND,
    };

    this.logger.log(`Base where: status = DISCREPANCY_FOUND`);

    // Explicit country/city filter from global filters
    if (cityId) {
      where.AND = [
        { OR: [
          { senderCityId: cityId },
          { receiverCityId: cityId },
        ]},
      ];
    } else if (countryId) {
      where.AND = [
        { OR: [
          { senderCountryId: countryId },
          { receiverCountryId: countryId },
          { senderCity: { countryId } },
          { receiverCity: { countryId } },
        ]},
      ];
    }

    // RBAC scope
    if (userRole === 'COUNTRY' && userCountryId) {
      where.OR = [
        { senderType: EntityType.COUNTRY, senderCountryId: userCountryId },
        { receiverType: EntityType.COUNTRY, receiverCountryId: userCountryId },
        { senderType: EntityType.CITY, senderCity: { countryId: userCountryId } },
        { receiverType: EntityType.CITY, receiverCity: { countryId: userCountryId } },
      ];
    } else if (userRole === 'CITY' && userCityId) {
      where.OR = [
        { senderType: EntityType.CITY, senderCityId: userCityId },
        { receiverType: EntityType.CITY, receiverCityId: userCityId },
      ];
    } else if (userRole === 'OFFICE' && userOfficeId) {
      // OFFICE sees transfers for countries assigned to their office
      const officeCountries = await this.prisma.country.findMany({
        where: { officeId: userOfficeId },
        select: { id: true },
      });
      const countryIds = officeCountries.map((c) => c.id);
      if (countryIds.length > 0) {
        where.OR = [
          { senderType: EntityType.COUNTRY, senderCountryId: { in: countryIds } },
          { receiverType: EntityType.COUNTRY, receiverCountryId: { in: countryIds } },
          { senderType: EntityType.CITY, senderCity: { countryId: { in: countryIds } } },
          { receiverType: EntityType.CITY, receiverCity: { countryId: { in: countryIds } } },
        ];
      }
    }

    const includeRelations = {
      items: true,
      acceptanceRecords: {
        include: {
          acceptedBy: { select: { id: true, displayName: true, username: true, role: true } },
        },
      },
      senderOffice: { select: { id: true, name: true, code: true } },
          senderCountry: { select: { id: true, name: true, code: true } },
      senderCity: { select: { id: true, name: true, slug: true, country: { select: { id: true, name: true } } } },
          receiverOffice: { select: { id: true, name: true, code: true } },
      receiverCountry: { select: { id: true, name: true, code: true } },
      receiverCity: { select: { id: true, name: true, slug: true, country: { select: { id: true, name: true } } } },
    };

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        include: includeRelations,
        orderBy: { acceptedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transfer.count({ where }),
    ]);

    this.logger.log(`=== findProblematic RESULTS ===`);
    this.logger.log(`Total count: ${total}`);
    this.logger.log(`Transfers returned: ${transfers.length}`);
    this.logger.log(`Transfer IDs: ${transfers.map(t => t.id).join(', ')}`);

    // Enrich with creator info
    const creatorIds = [...new Set(transfers.map((t) => t.createdBy))];
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, displayName: true, username: true, role: true },
    });
    const creatorsMap = new Map(creators.map((c) => [c.id, c]));

    const enriched = transfers.map((t) => ({
      ...t,
      createdByUser: creatorsMap.get(t.createdBy) || null,
    }));

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ──────────────────────────────────────────────
  // STATISTICS
  // ──────────────────────────────────────────────

  async getStats(params: {
    period: 'week' | 'month' | 'quarter' | 'year';
    countryId?: string;
    cityId?: string;
    userRole?: string;
    userCountryId?: string;
    userCityId?: string;
    userOfficeId?: string;
  }) {
    const { period, countryId, cityId, userRole, userCountryId, userCityId, userOfficeId } = params;

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    // Build base filter
    const baseWhere: Prisma.TransferWhereInput = {
      createdAt: { gte: startDate },
    };

    // Apply scope filters
    if (cityId) {
      baseWhere.OR = [
        { senderCityId: cityId },
        { receiverCityId: cityId },
      ];
    } else if (countryId) {
      baseWhere.OR = [
        { senderCountryId: countryId },
        { receiverCountryId: countryId },
        { senderCity: { countryId } },
        { receiverCity: { countryId } },
      ];
    } else if (userRole === 'CITY' && userCityId) {
      baseWhere.OR = [
        { senderCityId: userCityId },
        { receiverCityId: userCityId },
      ];
    } else if (userRole === 'COUNTRY' && userCountryId) {
      baseWhere.OR = [
        { senderCountryId: userCountryId },
        { receiverCountryId: userCountryId },
        { senderCity: { countryId: userCountryId } },
        { receiverCity: { countryId: userCountryId } },
      ];
    } else if (userRole === 'OFFICE' && userOfficeId) {
      // OFFICE: filter by office's countries
      const officeCountries = await this.prisma.country.findMany({
        where: { officeId: userOfficeId },
        select: { id: true },
      });
      const countryIds = officeCountries.map((c) => c.id);
      if (countryIds.length > 0) {
        baseWhere.OR = [
          { senderCountryId: { in: countryIds } },
          { receiverCountryId: { in: countryIds } },
          { senderCity: { countryId: { in: countryIds } } },
          { receiverCity: { countryId: { in: countryIds } } },
        ];
      }
    }

    // Get transfer statistics
    const [
      totalTransfers,
      acceptedTransfers,
      discrepancyTransfers,
      cancelledTransfers,
      allTransfers,
    ] = await Promise.all([
      this.prisma.transfer.count({ where: baseWhere }),
      this.prisma.transfer.count({ where: { ...baseWhere, status: TransferStatus.ACCEPTED } }),
      this.prisma.transfer.count({ where: { ...baseWhere, status: TransferStatus.DISCREPANCY_FOUND } }),
      this.prisma.transfer.count({ where: { ...baseWhere, status: TransferStatus.CANCELLED } }),
      this.prisma.transfer.findMany({
        where: baseWhere,
        include: { items: true },
      }),
    ]);

    // Calculate bracelet totals
    let totalBlack = 0, totalWhite = 0, totalRed = 0, totalBlue = 0;
    for (const transfer of allTransfers) {
      for (const item of transfer.items) {
        switch (item.itemType) {
          case 'BLACK': totalBlack += item.quantity; break;
          case 'WHITE': totalWhite += item.quantity; break;
          case 'RED': totalRed += item.quantity; break;
          case 'BLUE': totalBlue += item.quantity; break;
        }
      }
    }

    // Get transfer trend by date
    const transfersByDate = new Map<string, number>();
    for (const transfer of allTransfers) {
      const dateKey = transfer.createdAt.toISOString().split('T')[0];
      transfersByDate.set(dateKey, (transfersByDate.get(dateKey) || 0) + 1);
    }
    const trend = Array.from(transfersByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get user count in scope
    const userWhere: Prisma.UserWhereInput = { isActive: true };
    if (cityId) {
      userWhere.cityId = cityId;
    } else if (countryId) {
      userWhere.OR = [
        { countryId },
        { city: { countryId } },
      ];
    } else if (userCityId) {
      userWhere.cityId = userCityId;
    } else if (userCountryId) {
      userWhere.OR = [
        { countryId: userCountryId },
        { city: { countryId: userCountryId } },
      ];
    }
    const totalUsers = await this.prisma.user.count({ where: userWhere });

    // Get event count
    const eventWhere: Prisma.ExpenseWhereInput = {
      createdAt: { gte: startDate },
    };
    if (cityId) {
      eventWhere.cityId = cityId;
    } else if (countryId) {
      eventWhere.city = { countryId };
    } else if (userCityId) {
      eventWhere.cityId = userCityId;
    } else if (userCountryId) {
      eventWhere.city = { countryId: userCountryId };
    }
    const totalEvents = await this.prisma.expense.count({ where: eventWhere });

    // Get company losses
    const companyLosses = await (this.prisma as any).companyLoss.findMany({
      where: { resolvedAt: { gte: startDate } },
    }) as Array<{ totalAmount: number }>;
    const totalLoss = companyLosses.reduce((sum: number, l) => sum + l.totalAmount, 0);

    return {
      summary: {
        totalTransfers,
        totalBracelets: totalBlack + totalWhite + totalRed + totalBlue,
        totalUsers,
        totalEvents,
        totalLoss,
      },
      statusBreakdown: {
        accepted: acceptedTransfers,
        discrepancy: discrepancyTransfers,
        cancelled: cancelledTransfers,
        pending: totalTransfers - acceptedTransfers - discrepancyTransfers - cancelledTransfers,
      },
      braceletBreakdown: {
        black: totalBlack,
        white: totalWhite,
        red: totalRed,
        blue: totalBlue,
      },
      trend,
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    };
  }

  // ──────────────────────────────────────────────
  // RESOLVE DISCREPANCY (Admin/Office only)
  // Supports: ACCEPT_SENDER, ACCEPT_RECEIVER, ACCEPT_COMPROMISE
  // Creates CompanyLoss record when there's a loss
  // ──────────────────────────────────────────────

  async resolveDiscrepancy(
    transferId: string,
    dto: ResolveDiscrepancyDto,
    actorId: string,
  ) {
    const { resolutionType, compromiseValues, notes } = dto;

    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id: transferId },
        include: { 
          items: true, 
          acceptanceRecords: true,
          senderOffice: { select: { name: true } },
          senderCountry: { select: { name: true } },
          senderCity: { select: { name: true } },
          receiverOffice: { select: { name: true } },
          receiverCountry: { select: { name: true } },
          receiverCity: { select: { name: true } },
        },
      });

      if (!transfer) throw new NotFoundException(`Transfer ${transferId} not found`);

      if (transfer.status !== TransferStatus.DISCREPANCY_FOUND) {
        throw new ConflictException(
          `Transfer is in status ${transfer.status}, expected DISCREPANCY_FOUND`,
        );
      }

      // Calculate sent and received totals by color
      const sentByColor: Record<string, number> = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
      const receivedByColor: Record<string, number> = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };

      for (const item of transfer.items) {
        sentByColor[item.itemType] = item.quantity;
      }
      for (const record of transfer.acceptanceRecords) {
        receivedByColor[record.itemType] = record.receivedQuantity;
      }

      // Get sender/receiver names for CompanyLoss record
      const senderName = transfer.senderType === EntityType.ADMIN 
        ? 'ADMIN' 
        : transfer.senderOffice?.name || transfer.senderCountry?.name || transfer.senderCity?.name || 'Unknown';
      const senderCityName = transfer.senderCity?.name || null;
      const receiverName = transfer.receiverOffice?.name || transfer.receiverCountry?.name || transfer.receiverCity?.name || 'Unknown';
      const receiverCityName = transfer.receiverCity?.name || null;

      // Calculate final values based on resolution type
      let finalByColor: Record<string, number> = { ...receivedByColor }; // default to receiver
      let lossBlack = 0, lossWhite = 0, lossRed = 0, lossBlue = 0;
      const totalSent = Object.values(sentByColor).reduce((a, b) => a + b, 0);
      const totalReceived = Object.values(receivedByColor).reduce((a, b) => a + b, 0);

      // Use string values for comparison since resolutionType comes from DTO
      const resType = resolutionType as string;

      if (resType === 'ACCEPT_SENDER') {
        // Trust sender: receiver gets what sender sent
        // Shortage goes to RECEIVER (they claim to have received less)
        finalByColor = { ...sentByColor };
        lossBlack = Math.max(0, sentByColor.BLACK - receivedByColor.BLACK);
        lossWhite = Math.max(0, sentByColor.WHITE - receivedByColor.WHITE);
        lossRed = Math.max(0, sentByColor.RED - receivedByColor.RED);
        lossBlue = Math.max(0, sentByColor.BLUE - receivedByColor.BLUE);
      } else if (resType === 'ACCEPT_RECEIVER') {
        // Trust receiver: receiver gets what they reported
        // Shortage goes to SENDER (they claim to have sent more)
        finalByColor = { ...receivedByColor };
        lossBlack = Math.max(0, sentByColor.BLACK - receivedByColor.BLACK);
        lossWhite = Math.max(0, sentByColor.WHITE - receivedByColor.WHITE);
        lossRed = Math.max(0, sentByColor.RED - receivedByColor.RED);
        lossBlue = Math.max(0, sentByColor.BLUE - receivedByColor.BLUE);
      } else if (resType === 'ACCEPT_COMPROMISE') {
        if (!compromiseValues) {
          throw new BadRequestException('Compromise values are required for ACCEPT_COMPROMISE resolution');
        }
        // Custom values - shortage split between both
        finalByColor = {
          BLACK: compromiseValues.black,
          WHITE: compromiseValues.white,
          RED: compromiseValues.red,
          BLUE: compromiseValues.blue,
        };
        lossBlack = Math.max(0, sentByColor.BLACK - compromiseValues.black);
        lossWhite = Math.max(0, sentByColor.WHITE - compromiseValues.white);
        lossRed = Math.max(0, sentByColor.RED - compromiseValues.red);
        lossBlue = Math.max(0, sentByColor.BLUE - compromiseValues.blue);
      } else if (resType === 'ACCEPT_AS_IS') {
        // Nobody blamed: receiver gets what they reported
        // Difference goes to COMPANY LOSS (no individual shortage)
        finalByColor = { ...receivedByColor };
        lossBlack = Math.max(0, sentByColor.BLACK - receivedByColor.BLACK);
        lossWhite = Math.max(0, sentByColor.WHITE - receivedByColor.WHITE);
        lossRed = Math.max(0, sentByColor.RED - receivedByColor.RED);
        lossBlue = Math.max(0, sentByColor.BLUE - receivedByColor.BLUE);
      } else if (resType === 'CANCEL_TRANSFER') {
        // Cancel transfer: nothing credited to receiver, entire sent amount is company loss
        finalByColor = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
        lossBlack = sentByColor.BLACK;
        lossWhite = sentByColor.WHITE;
        lossRed = sentByColor.RED;
        lossBlue = sentByColor.BLUE;
      }

      const totalLoss = lossBlack + lossWhite + lossRed + lossBlue;

      // BALANCE CHANGES:
      // Sender was already deducted when transfer was created.
      // Now we need to:
      // - Credit receiver with final values
      // - For CANCEL_TRANSFER: Return all to sender (no receiver credit)
      const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
      const receiverEntityId = transfer.receiverOfficeId || transfer.receiverCountryId || transfer.receiverCityId;
      
      if (resType === 'CANCEL_TRANSFER') {
        // Return ALL bracelets to sender (they were deducted on send)
        for (const [colorStr, quantity] of Object.entries(sentByColor)) {
          if (quantity > 0) {
            await this.creditInventory(
              tx,
              transfer.senderType,
              senderEntityId,
              colorStr as ItemType,
              quantity,
            );
          }
        }
        this.logger.log(`Transfer ${transferId} CANCEL_TRANSFER: Returned ${JSON.stringify(sentByColor)} to sender`);
      } else {
        // Credit receiver with final values (based on resolution)
        for (const [colorStr, quantity] of Object.entries(finalByColor)) {
          if (quantity > 0) {
            await this.creditInventory(
              tx,
              transfer.receiverType,
              receiverEntityId,
              colorStr as ItemType,
              quantity,
            );
          }
        }
        this.logger.log(`Transfer ${transferId} resolved: Credited ${JSON.stringify(finalByColor)} to receiver`);
      }

      // Update city statuses
      if (transfer.senderType === EntityType.CITY && transfer.senderCityId) {
        await this.inventoryService.updateCityStatus(tx, transfer.senderCityId);
      }
      if (transfer.receiverType === EntityType.CITY && transfer.receiverCityId) {
        await this.inventoryService.updateCityStatus(tx, transfer.receiverCityId);
      }

      // Create Shortage records based on resolution type
      // - ACCEPT_SENDER: Shortage assigned to RECEIVER (receiver claimed less)
      // - ACCEPT_RECEIVER: Shortage assigned to SENDER (sender claimed more)
      // - ACCEPT_COMPROMISE: Shortage split between BOTH
      // - ACCEPT_AS_IS: NO shortage (company loss only)
      // - CANCEL_TRANSFER: NO shortage (company loss only)
      if (totalLoss > 0 && resType !== 'CANCEL_TRANSFER' && resType !== 'ACCEPT_AS_IS') {
        if (resType === 'ACCEPT_SENDER') {
          // Receiver is blamed - they claim to have received less than sender sent
          await (tx as any).shortage.create({
            data: {
              entityType: transfer.receiverType,
              officeId: transfer.receiverOfficeId,
              countryId: transfer.receiverCountryId,
              cityId: transfer.receiverCityId,
              transferId: transfer.id,
              black: lossBlack,
              white: lossWhite,
              red: lossRed,
              blue: lossBlue,
              totalAmount: totalLoss,
              reason: 'RECEIVER_BLAMED',
              resolutionType,
              resolvedBy: actorId,
              notes: notes || null,
            },
          });
          this.logger.log(`Shortage created for RECEIVER (${receiverName}) on transfer ${transferId}: ${totalLoss} bracelets`);
        } else if (resType === 'ACCEPT_RECEIVER') {
          // Sender is blamed - they claim to have sent more than receiver got
          await (tx as any).shortage.create({
            data: {
              entityType: transfer.senderType,
              officeId: transfer.senderOfficeId,
              countryId: transfer.senderCountryId,
              cityId: transfer.senderCityId,
              transferId: transfer.id,
              black: lossBlack,
              white: lossWhite,
              red: lossRed,
              blue: lossBlue,
              totalAmount: totalLoss,
              reason: 'SENDER_BLAMED',
              resolutionType,
              resolvedBy: actorId,
              notes: notes || null,
            },
          });
          this.logger.log(`Shortage created for SENDER (${senderName}) on transfer ${transferId}: ${totalLoss} bracelets`);
        } else if (resType === 'ACCEPT_COMPROMISE') {
          // COMPROMISE: Both parties get 100% of the loss recorded (not 50/50!)
          // Each is held responsible for the full discrepancy amount

          // Shortage for sender (100% of loss)
          await (tx as any).shortage.create({
            data: {
              entityType: transfer.senderType,
              officeId: transfer.senderOfficeId,
              countryId: transfer.senderCountryId,
              cityId: transfer.senderCityId,
              transferId: transfer.id,
              black: lossBlack,
              white: lossWhite,
              red: lossRed,
              blue: lossBlue,
              totalAmount: totalLoss,
              reason: 'SPLIT_LOSS',
              resolutionType,
              resolvedBy: actorId,
              notes: `Компромисс: полная сумма недостачи (отправитель). ${notes || ''}`.trim(),
            },
          });

          // Shortage for receiver (100% of loss)
          await (tx as any).shortage.create({
            data: {
              entityType: transfer.receiverType,
              officeId: transfer.receiverOfficeId,
              countryId: transfer.receiverCountryId,
              cityId: transfer.receiverCityId,
              transferId: transfer.id,
              black: lossBlack,
              white: lossWhite,
              red: lossRed,
              blue: lossBlue,
              totalAmount: totalLoss,
              reason: 'SPLIT_LOSS',
              resolutionType,
              resolvedBy: actorId,
              notes: `Компромисс: полная сумма недостачи (получатель). ${notes || ''}`.trim(),
            },
          });

          this.logger.log(`Shortage (100% each) for SENDER (${senderName}: ${totalLoss}) and RECEIVER (${receiverName}: ${totalLoss}) on transfer ${transferId}`);
        }
      }

      // Create CompanyLoss record ONLY for ACCEPT_AS_IS and CANCEL_TRANSFER
      // Other resolution types create shortages on individuals, not company loss
      if (totalLoss > 0 && (resType === 'ACCEPT_AS_IS' || resType === 'CANCEL_TRANSFER')) {
        await (tx as any).companyLoss.create({
          data: {
            transferId: transfer.id,
            black: lossBlack,
            white: lossWhite,
            red: lossRed,
            blue: lossBlue,
            totalAmount: totalLoss,
            resolutionType,
            resolvedBy: actorId,
            senderName,
            senderCity: senderCityName,
            receiverName,
            receiverCity: receiverCityName,
            originalSent: totalSent,
            originalReceived: totalReceived,
            notes: notes || null,
          },
        });

        this.logger.log(`CompanyLoss created for transfer ${transferId}: ${totalLoss} bracelets lost`);
      }

      // Update transfer status to ACCEPTED
      await tx.transfer.update({
        where: { id: transferId },
        data: { status: TransferStatus.ACCEPTED, version: transfer.version + 1 },
      });

      this.logger.log(`Discrepancy resolved: ${transferId} → ACCEPTED via ${resolutionType}`);

      await this.storeDomainEvent(transferId, 'DiscrepancyResolved', {
        resolutionType,
        actorId,
        totalLoss,
        compromiseValues,
      });

      return tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, acceptanceRecords: true },
      });
    });

    // Invalidate caches AFTER the transaction commits
    const resolvedTransfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
    });
    if (resolvedTransfer) {
      if (resolvedTransfer.senderType !== EntityType.ADMIN) {
        const senderEntityId = resolvedTransfer.senderOfficeId || resolvedTransfer.senderCountryId || resolvedTransfer.senderCityId;
        if (senderEntityId) {
          await this.redis.invalidateInventory(resolvedTransfer.senderType, senderEntityId as string);
        }
      }
      const receiverEntityId = resolvedTransfer.receiverOfficeId || resolvedTransfer.receiverCountryId || resolvedTransfer.receiverCityId;
      if (receiverEntityId) {
        await this.redis.invalidateInventory(resolvedTransfer.receiverType, receiverEntityId as string);
      }
    }

    return result;
  }

  // ──────────────────────────────────────────────
  // INTERNAL HELPERS
  // ──────────────────────────────────────────────

  private isReceiver(
    transfer: { receiverType: EntityType; receiverCountryId: string | null; receiverCityId: string | null },
    user: { role: string; countryId?: string | null; cityId?: string | null },
  ): boolean {
    if (user.role === 'COUNTRY' && transfer.receiverType === EntityType.COUNTRY) {
      return transfer.receiverCountryId === user.countryId;
    }
    if (user.role === 'CITY' && transfer.receiverType === EntityType.CITY) {
      return transfer.receiverCityId === user.cityId;
    }
    return false;
  }

  private isSameEntity(input: SendTransferInput): boolean {
    if (input.senderType === input.receiverType) {
      if (input.senderType === EntityType.COUNTRY) {
        return input.senderCountryId === input.receiverCountryId;
      }
      if (input.senderType === EntityType.CITY) {
        return input.senderCityId === input.receiverCityId;
      }
    }
    return false;
  }

  private async getEntityBalance(
    tx: Prisma.TransactionClient,
    entityType: EntityType,
    entityId: string | null,
    itemType: ItemType,
  ): Promise<number> {
    const where: Prisma.InventoryWhereInput = { entityType, itemType };
    if (entityType === EntityType.OFFICE) where.officeId = entityId;
    if (entityType === EntityType.COUNTRY) where.countryId = entityId;
    if (entityType === EntityType.CITY) where.cityId = entityId;

    const inventory = await tx.inventory.findFirst({ where });
    return inventory?.quantity ?? 0;
  }

  private async deductInventory(
    tx: Prisma.TransactionClient,
    entityType: EntityType,
    entityId: string | null,
    itemType: ItemType,
    quantity: number,
  ): Promise<void> {
    const where: Prisma.InventoryWhereInput = { entityType, itemType };
    if (entityType === EntityType.OFFICE) where.officeId = entityId;
    if (entityType === EntityType.COUNTRY) where.countryId = entityId;
    if (entityType === EntityType.CITY) where.cityId = entityId;

    const inventory = await tx.inventory.findFirst({ where });
    if (!inventory || inventory.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient ${itemType} stock for ${entityType}`,
      );
    }

    await tx.inventory.update({
      where: { id: inventory.id },
      data: { quantity: inventory.quantity - quantity },
    });
  }

  private async creditInventory(
    tx: Prisma.TransactionClient,
    entityType: EntityType,
    entityId: string | null,
    itemType: ItemType,
    quantity: number,
  ): Promise<void> {
    const where: Prisma.InventoryWhereInput = { entityType, itemType };
    if (entityType === EntityType.OFFICE) where.officeId = entityId;
    if (entityType === EntityType.COUNTRY) where.countryId = entityId;
    if (entityType === EntityType.CITY) where.cityId = entityId;

    const inventory = await tx.inventory.findFirst({ where });
    if (inventory) {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: inventory.quantity + quantity },
      });
    } else {
      await tx.inventory.create({
        data: {
          entityType,
          officeId: entityType === EntityType.OFFICE ? entityId : null,
          countryId: entityType === EntityType.COUNTRY ? entityId : null,
          cityId: entityType === EntityType.CITY ? entityId : null,
          itemType,
          quantity,
        },
      });
    }
  }

  private async storeDomainEvent(
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const lastEvent = await this.prisma.domainEvent.findFirst({
      where: { aggregateId },
      orderBy: { version: 'desc' },
    });

    await this.prisma.domainEvent.create({
      data: {
        aggregateType: 'Transfer',
        aggregateId,
        eventType,
        version: (lastEvent?.version ?? 0) + 1,
        payload: payload as Prisma.JsonObject,
      },
    });
  }
}
