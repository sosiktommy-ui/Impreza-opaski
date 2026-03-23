import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityType, ItemType, CityStatus, Prisma, Role } from '@prisma/client';

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
          eventDate: eventDate && !isNaN(new Date(eventDate).getTime()) ? new Date(eventDate) : new Date(),
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
  // MAP DATA — cities + inventory + transfer summaries
  // ──────────────────────────────────────────────

  async getMapData(user: {
    role: Role;
    officeId?: string | null;
    countryId?: string | null;
    cityId?: string | null;
  }) {
    const { role, countryId, cityId } = user;

    // Build city filter based on role
    const cityWhere: Prisma.CityWhereInput = {};
    if (role === Role.COUNTRY && countryId) {
      cityWhere.countryId = countryId;
    } else if (role === Role.CITY && cityId) {
      // Find the country for this city, show all sibling cities
      const myCity = await this.prisma.city.findUnique({
        where: { id: cityId },
        select: { countryId: true },
      });
      if (myCity?.countryId) {
        cityWhere.countryId = myCity.countryId;
      } else {
        cityWhere.id = cityId;
      }
    }
    // ADMIN / OFFICE — no filter

    // Get cities with inventory
    const cities = await this.prisma.city.findMany({
      where: cityWhere,
      include: {
        country: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });

    const cityIds = cities.map((c) => c.id);

    // Batch get inventory for all cities
    const inventories = await this.prisma.inventory.findMany({
      where: {
        entityType: EntityType.CITY,
        cityId: { in: cityIds },
      },
    });

    // Aggregate transfer volumes between locations (last 90 days)
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const transferSummary = await this.prisma.transfer.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['SENT', 'ACCEPTED', 'DISCREPANCY_FOUND'] },
        OR: [
          { senderCityId: { in: cityIds } },
          { receiverCityId: { in: cityIds } },
        ],
      },
      select: {
        senderType: true,
        senderCityId: true,
        senderCountryId: true,
        receiverType: true,
        receiverCityId: true,
        receiverCountryId: true,
        status: true,
        items: { select: { itemType: true, quantity: true } },
        senderCity: { select: { latitude: true, longitude: true } },
        senderCountry: { select: { latitude: true, longitude: true } },
        receiverCity: { select: { latitude: true, longitude: true } },
        receiverCountry: { select: { latitude: true, longitude: true } },
      },
    });

    // Build city data with inventory
    const cityData = cities
      .filter((c) => c.latitude && c.longitude)
      .map((city) => {
        const inv = inventories.filter((i) => i.cityId === city.id);
        const balance: Record<string, number> = {};
        for (const itemType of Object.values(ItemType)) {
          const entry = inv.find((i) => i.itemType === itemType);
          balance[itemType] = entry?.quantity ?? 0;
        }
        const total = Object.values(balance).reduce((a, b) => a + b, 0);

        return {
          id: city.id,
          name: city.name,
          slug: city.slug,
          status: city.status,
          latitude: city.latitude,
          longitude: city.longitude,
          countryId: city.countryId,
          countryName: city.country?.name || '',
          countryCode: city.country?.code || '',
          balance,
          totalStock: total,
        };
      });

    // Aggregate transfer lines between locations
    const lineMap = new Map<
      string,
      { fromLat: number; fromLng: number; toLat: number; toLng: number; volume: number }
    >();
    for (const t of transferSummary) {
      const from = t.senderCity || t.senderCountry;
      const to = t.receiverCity || t.receiverCountry;
      if (!from?.latitude || !to?.latitude) continue;
      if (from.latitude === 0 || to.latitude === 0) continue;

      const key = `${from.latitude},${from.longitude}-${to.latitude},${to.longitude}`;
      const vol = t.items.reduce((s, i) => s + i.quantity, 0);
      const existing = lineMap.get(key);
      if (existing) {
        existing.volume += vol;
      } else {
        lineMap.set(key, {
          fromLat: from.latitude,
          fromLng: from.longitude,
          toLat: to.latitude,
          toLng: to.longitude,
          volume: vol,
        });
      }
    }

    // Get countries for the scope
    const countryWhere: Prisma.CountryWhereInput = {};
    if (role === Role.COUNTRY && countryId) {
      countryWhere.id = countryId;
    } else if (role === Role.CITY && cityId) {
      const myCity = cities.find((c) => c.id === cityId);
      if (myCity) countryWhere.id = myCity.countryId;
    }

    const countries = await this.prisma.country.findMany({
      where: countryWhere,
      select: { id: true, name: true, code: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    });

    return {
      cities: cityData,
      countries,
      transferLines: Array.from(lineMap.values()),
    };
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

  // ──────────────────────────────────────────────
  // WAREHOUSE: Create bracelets (ADMIN/OFFICE)
  // ──────────────────────────────────────────────

  async createBracelets(params: {
    entityType: EntityType;
    officeId?: string;
    black: number;
    white: number;
    red: number;
    blue: number;
    notes?: string;
    actorId: string;
  }) {
    const { entityType, officeId, black, white, red, blue, notes, actorId } = params;

    // Validate entityType is ADMIN or OFFICE
    if (entityType !== EntityType.ADMIN && entityType !== EntityType.OFFICE) {
      throw new BadRequestException('Warehouse creation only available for ADMIN/OFFICE');
    }

    // Validate at least one color has quantity
    if (black <= 0 && white <= 0 && red <= 0 && blue <= 0) {
      throw new BadRequestException('At least one bracelet color must have quantity > 0');
    }

    const totalAmount = black + white + red + blue;

    return this.prisma.$transaction(async (tx) => {
      const colors = [
        { type: ItemType.BLACK, qty: black },
        { type: ItemType.WHITE, qty: white },
        { type: ItemType.RED, qty: red },
        { type: ItemType.BLUE, qty: blue },
      ];

      // Add to inventory for each color
      for (const { type, qty } of colors) {
        if (qty > 0) {
          const where = entityType === EntityType.ADMIN
            ? { entityType, officeId: null, countryId: null, cityId: null, itemType: type }
            : { entityType, officeId, itemType: type };

          let inventory = await tx.inventory.findFirst({
            where: {
              entityType,
              ...(entityType === EntityType.OFFICE ? { officeId } : { officeId: null, countryId: null, cityId: null }),
              itemType: type,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: inventory.quantity + qty },
            });
          } else {
            await tx.inventory.create({
              data: {
                entityType,
                ...(entityType === EntityType.OFFICE ? { officeId } : {}),
                itemType: type,
                quantity: qty,
              },
            });
          }
        }
      }

      // Create warehouse creation log
      const creation = await (tx as any).warehouseCreation.create({
        data: {
          entityType,
          officeId: entityType === EntityType.OFFICE ? officeId : null,
          black,
          white,
          red,
          blue,
          totalAmount,
          createdBy: actorId,
          notes: notes || null,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'BALANCE_TOPUP',
          entityType: entityType === EntityType.ADMIN ? 'Admin' : 'Office',
          entityId: officeId || 'admin',
          actorId,
          metadata: { black, white, red, blue, totalAmount, notes },
        },
      });

      // Invalidate cache
      if (entityType === EntityType.OFFICE && officeId) {
        await this.redis.invalidateInventory(EntityType.OFFICE, officeId);
      }
      await this.redis.del('inventory:all');

      this.logger.log(
        `Warehouse bracelets created: ${entityType}${officeId ? ':' + officeId : ''} — B:${black} W:${white} R:${red} BL:${blue} by ${actorId}`,
      );

      return creation;
    });
  }

  // Get warehouse creation history
  async getWarehouseCreationHistory(params: {
    entityType?: EntityType;
    officeId?: string;
    page?: number;
    limit?: number;
  }) {
    const { entityType, officeId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (officeId) where.officeId = officeId;

    const [creations, total] = await Promise.all([
      (this.prisma as any).warehouseCreation.findMany({
        where,
        include: {
          office: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).warehouseCreation.count({ where }),
    ]);

    return {
      data: creations,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Get warehouse balance for ADMIN or specific OFFICE
  async getWarehouseBalance(entityType: EntityType, officeId?: string) {
    if (entityType !== EntityType.ADMIN && entityType !== EntityType.OFFICE) {
      throw new BadRequestException('Only ADMIN or OFFICE entityType supported');
    }

    const where: Prisma.InventoryWhereInput = { entityType };
    if (entityType === EntityType.OFFICE) {
      where.officeId = officeId;
    } else {
      // ADMIN: no office/country/city
      where.officeId = null;
      where.countryId = null;
      where.cityId = null;
    }

    const inventory = await this.prisma.inventory.findMany({ where });

    const balance: Record<string, number> = {};
    for (const itemType of Object.values(ItemType)) {
      const entry = inventory.find((i) => i.itemType === itemType);
      balance[itemType] = entry?.quantity ?? 0;
    }

    return balance;
  }

  // ──────────────────────────────────────────────
  // COMPANY LOSSES: Summary and list
  // ──────────────────────────────────────────────

  async getCompanyLossesSummary() {
    const losses = await (this.prisma as any).companyLoss.findMany();

    const summary = {
      total: 0,
      black: 0,
      white: 0,
      red: 0,
      blue: 0,
      count: losses.length,
    };

    for (const loss of losses) {
      summary.total += loss.totalAmount || 0;
      summary.black += loss.black || 0;
      summary.white += loss.white || 0;
      summary.red += loss.red || 0;
      summary.blue += loss.blue || 0;
    }

    return summary;
  }

  async getCompanyLosses(params: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    countryId?: string;
  }) {
    const { page = 1, limit = 20, startDate, endDate } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (startDate) {
      where.resolvedAt = { ...where.resolvedAt, gte: new Date(startDate) };
    }
    if (endDate) {
      where.resolvedAt = { ...where.resolvedAt, lte: new Date(endDate) };
    }

    const [losses, total] = await Promise.all([
      (this.prisma as any).companyLoss.findMany({
        where,
        include: {
          transfer: {
            select: {
              id: true,
              status: true,
              senderType: true,
              receiverType: true,
              senderCity: { select: { id: true, name: true } },
              senderCountry: { select: { id: true, name: true } },
              receiverCity: { select: { id: true, name: true } },
              receiverCountry: { select: { id: true, name: true } },
            },
          },
          resolver: { select: { id: true, displayName: true, username: true } },
        },
        orderBy: { resolvedAt: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).companyLoss.count({ where }),
    ]);

    return {
      data: losses,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
