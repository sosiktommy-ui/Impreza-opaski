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
        office: { select: { id: true, name: true, code: true } },
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
            ...(entityType === EntityType.OFFICE
              ? { officeId: entityId }
              : entityType === EntityType.COUNTRY
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
          ...(entityType === EntityType.OFFICE
            ? { officeId: entityId }
            : entityType === EntityType.COUNTRY
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
  // CREATE EXPENSE (City only — event/мероприятие)
  // ──────────────────────────────────────────────

  async createExpense(params: {
    cityId: string;
    eventName: string;
    eventDate?: string;
    location?: string;
    black: number;
    white: number;
    red: number;
    blue: number;
    notes?: string;
    actorId: string;
  }) {
    const {
      cityId, eventName, eventDate, location,
      black, white, red, blue, notes, actorId,
    } = params;

    // Validate at least one color has quantity
    if (black <= 0 && white <= 0 && red <= 0 && blue <= 0) {
      throw new BadRequestException('At least one bracelet color must have quantity > 0');
    }

    // Validate city exists
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new NotFoundException(`City ${cityId} not found`);

    return this.prisma.$transaction(async (tx) => {
      // Check and deduct balance for each color
      const colors = [
        { type: ItemType.BLACK, qty: black },
        { type: ItemType.WHITE, qty: white },
        { type: ItemType.RED, qty: red },
        { type: ItemType.BLUE, qty: blue },
      ];

      for (const { type, qty } of colors) {
        if (qty > 0) {
          const where = { entityType: EntityType.CITY, cityId, itemType: type };
          const inventory = await tx.inventory.findFirst({ where });
          if (!inventory || inventory.quantity < qty) {
            throw new BadRequestException(
              `Insufficient ${type} stock: have ${inventory?.quantity ?? 0}, need ${qty}`,
            );
          }
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: inventory.quantity - qty },
          });
        }
      }

      // Create expense record
      const expense = await tx.expense.create({
        data: {
          cityId,
          eventName,
          eventDate: eventDate ? new Date(eventDate) : new Date(),
          location: location || null,
          black,
          white,
          red,
          blue,
          notes: notes || null,
          createdBy: actorId,
        },
        include: {
          city: { select: { id: true, name: true, slug: true } },
        },
      });

      // Update city status
      await this.updateCityStatus(tx, cityId);

      // Invalidate cache
      await this.redis.invalidateInventory(EntityType.CITY, cityId);

      this.logger.log(
        `Expense created: ${eventName} in ${city.name} — B:${black} W:${white} R:${red} BL:${blue}`,
      );

      return expense;
    });
  }

  // Get expenses (for events list)
  async getExpenses(params: {
    cityId?: string;
    countryId?: string;
    page?: number;
    limit?: number;
  }) {
    const { cityId, countryId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {};
    if (cityId) where.cityId = cityId;
    if (countryId) where.city = { countryId };

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          city: {
            select: {
              id: true,
              name: true,
              slug: true,
              country: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { eventDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Delete expense and restore inventory
  async deleteExpense(expenseId: string, actorId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: { city: true },
    });
    if (!expense) {
      throw new Error('Expense not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Restore inventory for each color
      const colors: Array<{ type: ItemType; qty: number }> = [
        { type: 'BLACK' as ItemType, qty: expense.black },
        { type: 'WHITE' as ItemType, qty: expense.white },
        { type: 'RED' as ItemType, qty: expense.red },
        { type: 'BLUE' as ItemType, qty: expense.blue },
      ];

      for (const { type, qty } of colors) {
        if (qty > 0) {
          await tx.inventory.updateMany({
            where: { entityType: 'CITY', cityId: expense.cityId, itemType: type },
            data: { quantity: { increment: qty } },
          });
        }
      }

      // Delete the expense record
      await tx.expense.delete({ where: { id: expenseId } });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'EXPENSE_DELETED',
          entityType: 'Expense',
          entityId: expenseId,
          actorId,
          metadata: {
            eventName: expense.eventName,
            black: expense.black,
            white: expense.white,
            red: expense.red,
            blue: expense.blue,
          },
        },
      });
    });

    return { success: true };
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

    const city = await tx.city.findUnique({
      where: { id: cityId },
      include: { country: { select: { name: true } } },
    });
    if (city && city.status !== newStatus) {
      await tx.city.update({
        where: { id: cityId },
        data: { status: newStatus },
      });

      this.logger.log(`City ${cityId} status changed: ${city.status} → ${newStatus}`);

      const totalBalance = inventories.reduce((sum, i) => sum + i.quantity, 0);

      // Emit notification events for LOW / INACTIVE
      if (newStatus === CityStatus.LOW) {
        this.eventEmitter.emit('city.lowStock', {
          cityId,
          cityName: city.name,
          countryName: city.country?.name || '',
          totalBalance,
          inventories,
        });
      } else if (newStatus === CityStatus.INACTIVE) {
        this.eventEmitter.emit('city.zeroStock', {
          cityId,
          cityName: city.name,
          countryName: city.country?.name || '',
        });
      }
    }
  }

  // ──────────────────────────────────────────────
  // INTERNAL: Build where clause
  // ──────────────────────────────────────────────

  private buildInventoryWhere(entityType: EntityType, entityId: string) {
    const where: Prisma.InventoryWhereInput = { entityType };
    if (entityType === EntityType.OFFICE) {
      where.officeId = entityId;
    } else if (entityType === EntityType.COUNTRY) {
      where.countryId = entityId;
    } else if (entityType === EntityType.CITY) {
      where.cityId = entityId;
    }
    return where;
  }
}
