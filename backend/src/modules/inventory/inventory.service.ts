import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityType, ItemType, CityStatus, Prisma } from '@prisma/client';

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ──────────────────────────────────────────────
  // GET BALANCE
  // ──────────────────────────────────────────────

  async getBalance(entityType: EntityType, entityId: string) {
    const cacheKey = `inventory:${entityType}:${entityId}`;
    const cached = await this.redis.get<Record<string, number>>(cacheKey);
    if (cached) return cached;

    const inventory = await this.prisma.inventory.findMany({
      where: this.buildInventoryWhere(entityType, entityId),
    });

    const balance: Record<string, number> = {};
    for (const itemType of Object.values(ItemType)) {
      const entry = inventory.find((i) => i.itemType === itemType);
      balance[itemType] = entry?.quantity ?? 0;
    }

    await this.redis.set(cacheKey, balance, CACHE_TTL);
    return balance;
  }

  async getAllBalances() {
    const cacheKey = 'inventory:all';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const inventory = await this.prisma.inventory.findMany({
      include: {
        country: { select: { id: true, name: true, code: true } },
        city: { select: { id: true, name: true, slug: true, countryId: true } },
      },
      orderBy: [{ entityType: 'asc' }, { itemType: 'asc' }],
    });

    await this.redis.set(cacheKey, inventory, CACHE_TTL);
    return inventory;
  }

  async getBalancesByCountry(countryId: string) {
    // Get country balance
    const countryBalance = await this.getBalance(EntityType.COUNTRY, countryId);

    // Get all cities in this country with their balances
    const cities = await this.prisma.city.findMany({
      where: { countryId },
      orderBy: { name: 'asc' },
    });

    const cityBalances = await Promise.all(
      cities.map(async (city) => ({
        city: { id: city.id, name: city.name, slug: city.slug, status: city.status },
        balance: await this.getBalance(EntityType.CITY, city.id),
      })),
    );

    return {
      country: countryBalance,
      cities: cityBalances,
    };
  }

  // ──────────────────────────────────────────────
  // ADJUST BALANCE (Admin only)
  // ──────────────────────────────────────────────

  async adjustBalance(params: {
    entityType: EntityType;
    entityId: string;
    itemType: ItemType;
    delta: number;
    reason: string;
    actorId: string;
  }) {
    const { entityType, entityId, itemType, delta, reason, actorId } = params;

    if (delta === 0) {
      throw new BadRequestException('Delta cannot be zero');
    }

    return this.prisma.$transaction(async (tx) => {
      // Find or create inventory entry
      const where = this.buildInventoryWhere(entityType, entityId);
      let inventory = await tx.inventory.findFirst({
        where: { ...where, itemType },
      });

      if (!inventory) {
        // Create entry
        inventory = await tx.inventory.create({
          data: {
            entityType,
            ...(entityType === EntityType.COUNTRY
              ? { countryId: entityId }
              : entityType === EntityType.CITY
              ? { cityId: entityId }
              : {}),
            itemType,
            quantity: 0,
          },
        });
      }

      const newQuantity = inventory.quantity + delta;
      if (newQuantity < 0) {
        throw new BadRequestException(
          `Insufficient stock: current ${inventory.quantity}, delta ${delta}`,
        );
      }

      // Update inventory
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      });

      // Create adjustment record
      const adjustment = await tx.adjustment.create({
        data: {
          entityType,
          ...(entityType === EntityType.COUNTRY
            ? { countryId: entityId }
            : entityType === EntityType.CITY
            ? { cityId: entityId }
            : {}),
          itemType,
          delta,
          reason,
          createdBy: actorId,
        },
      });

      // Update city status if applicable
      if (entityType === EntityType.CITY) {
        await this.updateCityStatus(tx, entityId);
      }

      // Invalidate cache
      await this.redis.invalidateInventory(entityType, entityId);

      this.logger.log(
        `Balance adjusted: ${entityType}:${entityId} ${itemType} ${delta > 0 ? '+' : ''}${delta} by ${actorId}`,
      );

      // Emit event
      this.eventEmitter.emit('inventory.adjusted', {
        entityType,
        entityId,
        itemType,
        delta,
        newQuantity,
        reason,
        actorId,
      });

      return adjustment;
    });
  }

  // ──────────────────────────────────────────────
  // CREATE EXPENSE (City only)
  // ──────────────────────────────────────────────

  async createExpense(params: {
    cityId: string;
    itemType: ItemType;
    quantity: number;
    reason: string;
    actorId: string;
  }) {
    const { cityId, itemType, quantity, reason, actorId } = params;

    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    return this.adjustBalance({
      entityType: EntityType.CITY,
      entityId: cityId,
      itemType,
      delta: -quantity,
      reason: `EXPENSE: ${reason}`,
      actorId,
    });
  }

  // ──────────────────────────────────────────────
  // INTERNAL: Update city status based on inventory
  // ──────────────────────────────────────────────

  async updateCityStatus(
    tx: Prisma.TransactionClient,
    cityId: string,
  ): Promise<void> {
    const inventories = await tx.inventory.findMany({
      where: { entityType: EntityType.CITY, cityId },
    });

    const allZero = inventories.every((i) => i.quantity === 0);
    const anyLow = inventories.some((i) => i.quantity < 200 && i.quantity > 0);

    let newStatus: CityStatus;
    if (allZero || inventories.length === 0) {
      newStatus = CityStatus.INACTIVE;
    } else if (anyLow) {
      newStatus = CityStatus.LOW;
    } else {
      newStatus = CityStatus.ACTIVE;
    }

    const city = await tx.city.findUnique({ where: { id: cityId } });
    if (city && city.status !== newStatus) {
      await tx.city.update({
        where: { id: cityId },
        data: { status: newStatus },
      });

      this.logger.log(`City ${cityId} status changed: ${city.status} → ${newStatus}`);

      // Emit notification events for LOW / INACTIVE
      if (newStatus === CityStatus.LOW) {
        this.eventEmitter.emit('city.lowStock', { cityId, inventories });
      } else if (newStatus === CityStatus.INACTIVE) {
        this.eventEmitter.emit('city.zeroStock', { cityId });
      }
    }
  }

  // ──────────────────────────────────────────────
  // INTERNAL: Build where clause
  // ──────────────────────────────────────────────

  private buildInventoryWhere(entityType: EntityType, entityId: string) {
    const where: Prisma.InventoryWhereInput = { entityType };
    if (entityType === EntityType.COUNTRY) {
      where.countryId = entityId;
    } else if (entityType === EntityType.CITY) {
      where.cityId = entityId;
    }
    return where;
  }
}
