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
      // For non-admin senders: just CHECK that inventory exists (don't deduct yet)
      // Actual deduction happens when receiver confirms (acceptTransfer)
      if (!isAdminSender) {
        for (const item of input.items) {
          const entityId = input.senderType === EntityType.OFFICE
            ? (input.senderOfficeId || null)
            : input.senderType === EntityType.COUNTRY
            ? (input.senderCountryId || null)
            : (input.senderCityId || null);
          const balance = await this.getEntityBalance(
            tx,
            input.senderType,
            entityId,
            item.itemType,
          );
          if (balance < item.quantity) {
            throw new BadRequestException(
              `Insufficient ${item.itemType} balance: have ${balance}, need ${item.quantity}`,
            );
          }
        }
        // NOTE: No deduction here! Deduction happens on accept.
      }

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

        // Optimistic lock via version
        const lockResult = await tx.transfer.updateMany({
          where: {
            id: transferId,
            version: transfer.version,
            status: TransferStatus.SENT,
          },
          data: {
            status: newStatus,
            acceptedAt: new Date(),
            version: transfer.version + 1,
          },
        });

        if (lockResult.count === 0) {
          throw new ConflictException(
            'Transfer was modified by another process. Please retry.',
          );
        }

        // If discrepancy found — do NOT deduct sender, do NOT credit receiver.
        // Transfer stays frozen in DISCREPANCY_FOUND until Admin/Office resolves.
        if (hasDiscrepancy) {
          // Nothing happens to balances — frozen until resolve
        } else {
          // No discrepancy: deduct sender (sentQty) + credit receiver (receivedQty)
          if (transfer.senderType !== EntityType.ADMIN) {
            const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
            for (const item of transfer.items) {
              await this.deductInventory(
                tx,
                transfer.senderType,
                senderEntityId,
                item.itemType,
                item.quantity,
              );
            }
          }

          const receiverEntityId = transfer.receiverOfficeId || transfer.receiverCountryId || transfer.receiverCityId;
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
          newStatus,
          actorId,
          records,
          hasDiscrepancy,
        });

        this.logger.log(`Transfer ${transferId} ${newStatus}`);

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

        if (hasDiscrepancy) {
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

      // NOTE: No return-to-sender needed — inventory is NOT deducted on send.
      // Deduction only happens on accept.

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

      // NOTE: No return-to-sender needed — inventory is NOT deducted on send.
      // Deduction only happens on accept.

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

      this.eventEmitter.emit('transfer.cancelled', {
        transferId,
        fromEntityId,
        fromEntityType: transfer.senderType,
        toEntityId,
        toEntityType: transfer.receiverType,
        actorId,
        cancelledByName: canceller?.displayName || canceller?.username || 'Unknown',
      });

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
      userRole,
      userId,
      userCountryId,
      userCityId,
      userOfficeId,
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {};

    if (status) where.status = status;

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
    userRole?: string;
    userCountryId?: string;
    userCityId?: string;
    userOfficeId?: string;
  }) {
    const { page = 1, limit = 20, userRole, userCountryId, userCityId, userOfficeId } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {
      status: TransferStatus.DISCREPANCY_FOUND,
    };

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
  // RESOLVE DISCREPANCY (Admin/Office only)
  // ──────────────────────────────────────────────

  async resolveDiscrepancy(
    transferId: string,
    action: 'accept_received' | 'cancel',
    actorId: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id: transferId },
        include: { items: true, acceptanceRecords: true },
      });

      if (!transfer) throw new NotFoundException(`Transfer ${transferId} not found`);

      if (transfer.status !== TransferStatus.DISCREPANCY_FOUND) {
        throw new ConflictException(
          `Transfer is in status ${transfer.status}, expected DISCREPANCY_FOUND`,
        );
      }

      if (action === 'accept_received') {
        // Deduct sender with SENT quantities (for non-ADMIN)
        if (transfer.senderType !== EntityType.ADMIN) {
          const senderEntityId = transfer.senderOfficeId || transfer.senderCountryId || transfer.senderCityId;
          for (const item of transfer.items) {
            await this.deductInventory(
              tx,
              transfer.senderType,
              senderEntityId,
              item.itemType,
              item.quantity,
            );
          }
        }

        // Credit receiver with what they actually counted (receivedQuantity)
        const receiverEntityId = transfer.receiverOfficeId || transfer.receiverCountryId || transfer.receiverCityId;
        for (const record of transfer.acceptanceRecords) {
          if (record.receivedQuantity > 0) {
            await this.creditInventory(
              tx,
              transfer.receiverType,
              receiverEntityId,
              record.itemType,
              record.receivedQuantity,
            );
          }
        }

        // Update city statuses
        if (transfer.senderType === EntityType.CITY && transfer.senderCityId) {
          await this.inventoryService.updateCityStatus(tx, transfer.senderCityId);
        }
        if (transfer.receiverType === EntityType.CITY && transfer.receiverCityId) {
          await this.inventoryService.updateCityStatus(tx, transfer.receiverCityId);
        }

        await tx.transfer.update({
          where: { id: transferId },
          data: { status: TransferStatus.ACCEPTED, version: transfer.version + 1 },
        });

        this.logger.log(`Discrepancy resolved: ${transferId} → ACCEPTED (sender deducted sent, receiver credited received)`);
      } else {
        // Cancel — do NOT touch any balances.
        // Since acceptTransfer did not deduct/credit on discrepancy, nothing to reverse.
        await tx.transfer.update({
          where: { id: transferId },
          data: { status: TransferStatus.CANCELLED, version: transfer.version + 1 },
        });

        this.logger.log(`Discrepancy resolved: ${transferId} → CANCELLED (no balance changes)`);
      }

      await this.storeDomainEvent(transferId, 'DiscrepancyResolved', {
        action,
        actorId,
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
