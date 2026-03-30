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
  // HELPER: Get city's country ID for scope checks
  // ──────────────────────────────────────────────

  async getCityCountryId(cityId: string): Promise<string | null> {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { countryId: true },
    });
    return city?.countryId || null;
  }

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

  async getAllBalances(filters?: { countryId?: string; cityId?: string }) {
    const where: any = {};
    if (filters?.cityId) {
      where.entityType = 'CITY';
      where.cityId = filters.cityId;
    } else if (filters?.countryId) {
      // Get all cities in this country, plus the country itself
      where.OR = [
        { entityType: 'COUNTRY', countryId: filters.countryId },
        { entityType: 'CITY', city: { countryId: filters.countryId } },
      ];
    }

    const hasFilters = !!(filters?.countryId || filters?.cityId);
    if (!hasFilters) {
      const cacheKey = 'inventory:all';
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    }

    const inventory = await this.prisma.inventory.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        office: { select: { id: true, name: true, code: true } },
        country: { select: { id: true, name: true, code: true } },
        city: { select: { id: true, name: true, slug: true, countryId: true } },
      },
      orderBy: [{ entityType: 'asc' }, { itemType: 'asc' }],
    });

    if (!hasFilters) {
      await this.redis.set('inventory:all', inventory, CACHE_TTL);
    }
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

    try {
      this.logger.log(`getWarehouseCreationHistory: entityType=${entityType}, officeId=${officeId}, page=${page}, limit=${limit}`);
      
      const where: any = {};
      if (entityType) where.entityType = entityType;
      if (officeId) where.officeId = officeId;

      // Check if warehouseCreation model exists on prisma client
      if (!(this.prisma as any).warehouseCreation) {
        this.logger.error('warehouseCreation model not found on Prisma client - run prisma generate');
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }

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

      // Fetch creator user info for each creation
      const userIds = [...new Set(creations.map((c: any) => c.createdBy).filter(Boolean))] as string[];
      const users = userIds.length > 0 
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, displayName: true, role: true },
          })
        : [];
      const userMap = new Map(users.map(u => [u.id, u]));

      // Attach user info to each creation
      const creationsWithUser = creations.map((c: any) => ({
        ...c,
        createdByUser: userMap.get(c.createdBy) || null,
      }));

      this.logger.log(`getWarehouseCreationHistory: found ${total} records`);
      return {
        data: creationsWithUser,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error: any) {
      this.logger.error(`getWarehouseCreationHistory ERROR: ${error?.message}`, error?.stack);
      // Return empty result instead of throwing to prevent 503
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
  }

  // Get warehouse balance for ADMIN or specific OFFICE
  async getWarehouseBalance(entityType: EntityType, officeId?: string) {
    try {
      this.logger.log(`getWarehouseBalance: entityType=${entityType}, officeId=${officeId}`);
      
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

      // Return lowercase keys to match frontend expectations
      const balance = {
        black: 0,
        white: 0,
        red: 0,
        blue: 0,
      };
      for (const entry of inventory) {
        const key = entry.itemType.toLowerCase() as keyof typeof balance;
        if (key in balance) {
          balance[key] = entry.quantity;
        }
      }

      this.logger.log(`getWarehouseBalance: ${entityType}${officeId ? ':' + officeId : ''} => ${JSON.stringify(balance)}`);
      return balance;
    } catch (error: any) {
      this.logger.error(`getWarehouseBalance ERROR: ${error?.message}`, error?.stack);
      // Return empty balance instead of throwing to prevent 503
      return { black: 0, white: 0, red: 0, blue: 0 };
    }
  }

  // ──────────────────────────────────────────────
  // COMPANY LOSSES: Summary and list
  // ──────────────────────────────────────────────

  async getCompanyLossesSummary(filters?: { countryId?: string; cityId?: string }) {
    try {
      this.logger.log('getCompanyLossesSummary: starting...');
      
      // Check if companyLoss model exists on prisma client
      if (!(this.prisma as any).companyLoss) {
        this.logger.error('companyLoss model not found on Prisma client - run prisma generate');
        return { total: 0, black: 0, white: 0, red: 0, blue: 0, count: 0 };
      }

      const where: any = {};
      if (filters?.cityId) {
        where.transfer = {
          OR: [
            { senderCityId: filters.cityId },
            { receiverCityId: filters.cityId },
          ],
        };
      } else if (filters?.countryId) {
        where.transfer = {
          OR: [
            { senderCountryId: filters.countryId },
            { receiverCountryId: filters.countryId },
            { senderCity: { countryId: filters.countryId } },
            { receiverCity: { countryId: filters.countryId } },
          ],
        };
      }
      
      const losses = await (this.prisma as any).companyLoss.findMany({ where });
      this.logger.log(`getCompanyLossesSummary: found ${losses?.length || 0} losses`);

      const summary = {
        total: 0,
        black: 0,
        white: 0,
        red: 0,
        blue: 0,
        count: losses?.length || 0,
      };

      for (const loss of (losses || [])) {
        summary.total += loss.totalAmount || 0;
        summary.black += loss.black || 0;
        summary.white += loss.white || 0;
        summary.red += loss.red || 0;
        summary.blue += loss.blue || 0;
      }

      return summary;
    } catch (error: any) {
      this.logger.error(`getCompanyLossesSummary ERROR: ${error?.message}`, error?.stack);
      // Return empty result instead of throwing to prevent 503
      return { total: 0, black: 0, white: 0, red: 0, blue: 0, count: 0 };
    }
  }

  async getCompanyLosses(params: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    countryId?: string;
    cityId?: string;
  }) {
    const { page = 1, limit = 20, startDate, endDate, countryId, cityId } = params;
    const skip = (page - 1) * limit;

    try {
      this.logger.log(`getCompanyLosses: page=${page}, limit=${limit}`);
      
      // Check if companyLoss model exists on prisma client
      if (!(this.prisma as any).companyLoss) {
        this.logger.error('companyLoss model not found on Prisma client - run prisma generate');
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }

      const where: any = {};
      if (startDate) {
        where.resolvedAt = { ...where.resolvedAt, gte: new Date(startDate) };
      }
      if (endDate) {
        where.resolvedAt = { ...where.resolvedAt, lte: new Date(endDate) };
      }
      if (cityId) {
        where.transfer = {
          OR: [
            { senderCityId: cityId },
            { receiverCityId: cityId },
          ],
        };
      } else if (countryId) {
        where.transfer = {
          OR: [
            { senderCountryId: countryId },
            { receiverCountryId: countryId },
            { senderCity: { countryId } },
            { receiverCity: { countryId } },
          ],
        };
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

      this.logger.log(`getCompanyLosses: found ${total} records`);
      return {
        data: losses,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error: any) {
      this.logger.error(`getCompanyLosses ERROR: ${error?.message}`, error?.stack);
      // Return empty result instead of throwing to prevent 503
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
  }

  // ──────────────────────────────────────────────
  // SYSTEM MINUS: Total Created - Sum of All Balances
  // ──────────────────────────────────────────────

  async getSystemMinusSummary() {
    try {
      this.logger.log('getSystemMinusSummary: starting...');

      // 1. Total created (from WarehouseCreation)
      const created = { black: 0, white: 0, red: 0, blue: 0 };
      if ((this.prisma as any).warehouseCreation) {
        const creations = await (this.prisma as any).warehouseCreation.findMany({
          select: { black: true, white: true, red: true, blue: true },
        });
        for (const c of creations) {
          created.black += c.black || 0;
          created.white += c.white || 0;
          created.red += c.red || 0;
          created.blue += c.blue || 0;
        }
      }

      // 2. Sum of all account balances (excluding ADMIN entity)
      const allInventory = await this.prisma.inventory.findMany({
        where: { entityType: { not: EntityType.ADMIN } },
        select: { itemType: true, quantity: true },
      });
      const balances = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
      for (const inv of allInventory) {
        if (balances[inv.itemType] !== undefined) {
          balances[inv.itemType] += inv.quantity || 0;
        }
      }

      // 3. System minus = created - distributed balances
      const result = {
        black: created.black - balances.BLACK,
        white: created.white - balances.WHITE,
        red: created.red - balances.RED,
        blue: created.blue - balances.BLUE,
        total: 0,
        totalCreated: created.black + created.white + created.red + created.blue,
        totalBalances: balances.BLACK + balances.WHITE + balances.RED + balances.BLUE,
      };
      result.total = result.black + result.white + result.red + result.blue;

      this.logger.log(`getSystemMinusSummary: created=${result.totalCreated}, balances=${result.totalBalances}, minus=${result.total}`);
      return result;
    } catch (error: any) {
      this.logger.error(`getSystemMinusSummary ERROR: ${error?.message}`, error?.stack);
      return { black: 0, white: 0, red: 0, blue: 0, total: 0, totalCreated: 0, totalBalances: 0 };
    }
  }

  // ──────────────────────────────────────────────
  // SYSTEM LOSSES (Company + Account Shortages)
  // ──────────────────────────────────────────────

  async getSystemLossesSummary() {
    try {
      this.logger.log('getSystemLossesSummary: starting...');
      
      const summary = { total: 0, black: 0, white: 0, red: 0, blue: 0, companyCount: 0, shortageCount: 0 };
      
      // Get company losses
      if ((this.prisma as any).companyLoss) {
        const companyLosses = await (this.prisma as any).companyLoss.findMany();
        summary.companyCount = companyLosses?.length || 0;
        for (const loss of (companyLosses || [])) {
          summary.total += loss.totalAmount || 0;
          summary.black += loss.black || 0;
          summary.white += loss.white || 0;
          summary.red += loss.red || 0;
          summary.blue += loss.blue || 0;
        }
      }
      
      // Get account shortages
      if ((this.prisma as any).shortage) {
        const shortages = await (this.prisma as any).shortage.findMany();
        summary.shortageCount = shortages?.length || 0;
        for (const s of (shortages || [])) {
          summary.total += s.totalAmount || 0;
          summary.black += s.black || 0;
          summary.white += s.white || 0;
          summary.red += s.red || 0;
          summary.blue += s.blue || 0;
        }
      }
      
      this.logger.log(`getSystemLossesSummary: companyLosses=${summary.companyCount}, shortages=${summary.shortageCount}, total=${summary.total}`);
      return summary;
    } catch (error: any) {
      this.logger.error(`getSystemLossesSummary ERROR: ${error?.message}`, error?.stack);
      return { total: 0, black: 0, white: 0, red: 0, blue: 0, companyCount: 0, shortageCount: 0 };
    }
  }

  async getSystemLosses(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    
    try {
      this.logger.log(`getSystemLosses: page=${page}, limit=${limit}`);
      
      const all: any[] = [];
      
      // Get company losses
      if ((this.prisma as any).companyLoss) {
        const companyLosses = await (this.prisma as any).companyLoss.findMany({
          include: {
            transfer: { select: { id: true } },
            resolver: { select: { displayName: true, username: true } },
          },
          orderBy: { resolvedAt: 'desc' },
        });
        
        for (const cl of (companyLosses || [])) {
          all.push({
            id: cl.id,
            type: 'COMPANY',
            entityName: 'Компания (IMPREZA)',
            entityType: 'COMPANY',
            transferId: cl.transferId,
            senderName: cl.senderName,
            receiverName: cl.receiverName,
            black: cl.black,
            white: cl.white,
            red: cl.red,
            blue: cl.blue,
            totalAmount: cl.totalAmount,
            resolutionType: cl.resolutionType,
            resolvedBy: cl.resolver?.displayName || cl.resolver?.username || 'Unknown',
            createdAt: cl.resolvedAt,
          });
        }
      }
      
      // Get account shortages
      if ((this.prisma as any).shortage) {
        const shortages = await (this.prisma as any).shortage.findMany({
          include: {
            transfer: {
              select: {
                id: true,
                senderCity: { select: { name: true } },
                senderCountry: { select: { name: true } },
                senderOffice: { select: { name: true } },
                receiverCity: { select: { name: true } },
                receiverCountry: { select: { name: true } },
                receiverOffice: { select: { name: true } },
              },
            },
            office: { select: { name: true } },
            country: { select: { name: true } },
            city: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        
        for (const s of (shortages || [])) {
          const entityName = s.city?.name || s.country?.name || s.office?.name || s.entityType;
          const senderName = s.transfer?.senderCity?.name || s.transfer?.senderCountry?.name || s.transfer?.senderOffice?.name || 'Admin';
          const receiverName = s.transfer?.receiverCity?.name || s.transfer?.receiverCountry?.name || s.transfer?.receiverOffice?.name || 'Unknown';
          
          all.push({
            id: s.id,
            type: 'SHORTAGE',
            entityName,
            entityType: s.entityType,
            entityId: s.cityId || s.countryId || s.officeId,
            transferId: s.transferId,
            senderName,
            receiverName,
            black: s.black,
            white: s.white,
            red: s.red,
            blue: s.blue,
            totalAmount: s.totalAmount,
            resolutionType: s.resolutionType,
            reason: s.reason,
            notes: s.notes,
            createdAt: s.createdAt,
          });
        }
      }
      
      // Sort by date desc
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const total = all.length;
      const start = (page - 1) * limit;
      const data = all.slice(start, start + limit);
      
      this.logger.log(`getSystemLosses: total=${total}, returning ${data.length} items`);
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    } catch (error: any) {
      this.logger.error(`getSystemLosses ERROR: ${error?.message}`, error?.stack);
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
  }

  async getAccountLosses(entityType: string, entityId: string) {
    try {
      this.logger.log(`getAccountLosses: ${entityType}/${entityId}`);
      
      if (!(this.prisma as any).shortage) {
        return { data: [], summary: { total: 0, black: 0, white: 0, red: 0, blue: 0 } };
      }
      
      const where: any = { entityType };
      if (entityType === 'OFFICE') where.officeId = entityId;
      else if (entityType === 'COUNTRY') where.countryId = entityId;
      else if (entityType === 'CITY') where.cityId = entityId;
      
      const shortages = await (this.prisma as any).shortage.findMany({
        where,
        include: {
          transfer: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      
      const summary = { total: 0, black: 0, white: 0, red: 0, blue: 0 };
      for (const s of (shortages || [])) {
        summary.total += s.totalAmount || 0;
        summary.black += s.black || 0;
        summary.white += s.white || 0;
        summary.red += s.red || 0;
        summary.blue += s.blue || 0;
      }
      
      this.logger.log(`getAccountLosses: found ${shortages?.length || 0} shortages`);
      return { data: shortages, summary };
    } catch (error: any) {
      this.logger.error(`getAccountLosses ERROR: ${error?.message}`, error?.stack);
      return { data: [], summary: { total: 0, black: 0, white: 0, red: 0, blue: 0 } };
    }
  }
}
