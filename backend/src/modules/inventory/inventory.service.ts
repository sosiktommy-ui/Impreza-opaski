import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CityStatus, Prisma, Role } from '@prisma/client';
import { BalancesService } from '../balances/balances.service';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly balances: BalancesService,
  ) {}

  // ────────────────────────────────────────────────
  // CITY BALANCE  (aggregate of all USER balances in city)
  // ────────────────────────────────────────────────

  async getBalance(cityId: string) {
    return this.balances.getCityBalance(cityId);
  }

  async getBalancesByCountry(countryId: string) {
    return this.balances.getCountryBalance(countryId);
  }

  // ────────────────────────────────────────────────
  // EXPENSES  (deducted from creator's personal balance)
  // ────────────────────────────────────────────────

  async createExpense(params: {
    cityId: string;
    userId: string; // creator — balance deducted from this person
    eventName: string;
    eventDate?: string;
    location?: string;
    type?: string;
    black: number;
    white: number;
    red: number;
    blue: number;
    notes?: string;
    actorId: string;
  }) {
    const {
      cityId, userId, eventName, eventDate, location,
      type = 'INTERNAL',
      black, white, red, blue, notes, actorId,
    } = params;

    if (black <= 0 && white <= 0 && red <= 0 && blue <= 0) {
      throw new BadRequestException('At least one bracelet color must have quantity > 0');
    }

    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new NotFoundException(`City ${cityId} not found`);

    const creator = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, role: true,
        balanceBlack: true, balanceWhite: true,
        balanceRed: true, balanceBlue: true, balanceVersion: true,
      },
    });
    if (!creator) throw new NotFoundException(`User ${userId} not found`);
    if (creator.role !== Role.USER) {
      throw new BadRequestException('Only USER-role accounts can have expenses deducted');
    }

    if (creator.balanceBlack < black) throw new BadRequestException(`Insufficient BLACK balance: have ${creator.balanceBlack}, need ${black}`);
    if (creator.balanceWhite < white) throw new BadRequestException(`Insufficient WHITE balance: have ${creator.balanceWhite}, need ${white}`);
    if (creator.balanceRed < red) throw new BadRequestException(`Insufficient RED balance: have ${creator.balanceRed}, need ${red}`);
    if (creator.balanceBlue < blue) throw new BadRequestException(`Insufficient BLUE balance: have ${creator.balanceBlue}, need ${blue}`);

    return this.prisma.$transaction(async (tx) => {
      // Optimistic-lock deduction
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          balanceVersion: creator.balanceVersion,
          balanceBlack: { gte: black },
          balanceWhite: { gte: white },
          balanceRed: { gte: red },
          balanceBlue: { gte: blue },
        },
        data: {
          balanceBlack: { decrement: black },
          balanceWhite: { decrement: white },
          balanceRed: { decrement: red },
          balanceBlue: { decrement: blue },
          balanceVersion: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Balance has changed, please retry');
      }

      const expense = await tx.expense.create({
        data: {
          cityId,
          userId,
          eventName,
          eventDate: eventDate && !isNaN(new Date(eventDate).getTime()) ? new Date(eventDate) : new Date(),
          location: location || null,
          type: (type as any) ?? 'INTERNAL',
          black,
          white,
          red,
          blue,
          notes: notes || null,
          createdBy: actorId,
        },
        include: {
          city: { select: { id: true, name: true, slug: true } },
          creator: { select: { id: true, username: true, displayName: true } },
        },
      });

      await this.updateCityStatus(tx, cityId);

      await tx.auditLog.create({
        data: {
          action: 'EXPENSE_CREATED',
          entityType: 'Expense',
          entityId: expense.id,
          actorId,
          metadata: { eventName, cityId, userId, black, white, red, blue },
        },
      });

      this.logger.log(`Expense: ${eventName} in ${city.name} by user ${userId} — B:${black} W:${white} R:${red} BL:${blue}`);
      await this.redis.del(`balance:user:${userId}`);
      return expense;
    });
  }

  async getExpenses(params: {
    cityId?: string;
    countryId?: string;
    userId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const { cityId, countryId, userId, type, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {};
    if (cityId) where.cityId = cityId;
    if (countryId) where.city = { countryId };
    if (userId) where.userId = userId;
    if (type) (where as any).type = type;

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          city: {
            select: {
              id: true, name: true, slug: true,
              country: { select: { id: true, name: true, code: true } },
            },
          },
          creator: { select: { id: true, username: true, displayName: true, role: true } },
        },
        orderBy: { eventDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data: expenses, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async deleteExpense(expenseId: string, actorId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Expense not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: expense.userId },
        data: {
          balanceBlack: { increment: expense.black },
          balanceWhite: { increment: expense.white },
          balanceRed: { increment: expense.red },
          balanceBlue: { increment: expense.blue },
          balanceVersion: { increment: 1 },
        },
      });

      await tx.expense.delete({ where: { id: expenseId } });

      await tx.auditLog.create({
        data: {
          action: 'EXPENSE_DELETED',
          entityType: 'Expense',
          entityId: expenseId,
          actorId,
          metadata: {
            eventName: expense.eventName,
            cityId: expense.cityId,
            userId: expense.userId,
            black: expense.black, white: expense.white, red: expense.red, blue: expense.blue,
          },
        },
      });

      await this.updateCityStatus(tx, expense.cityId);
    });

    await this.redis.del(`balance:user:${expense.userId}`);
    return { success: true };
  }

  // ────────────────────────────────────────────────
  // WAREHOUSE — create bracelets → credit to a recipient USER
  // ────────────────────────────────────────────────

  async createBracelets(params: {
    recipientUserId: string;
    black: number;
    white: number;
    red: number;
    blue: number;
    notes?: string;
    actorId: string;
  }) {
    const { recipientUserId, black, white, red, blue, notes, actorId } = params;

    if (black <= 0 && white <= 0 && red <= 0 && blue <= 0) {
      throw new BadRequestException('At least one bracelet color must have quantity > 0');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { id: true, role: true, displayName: true },
    });
    if (!recipient) throw new NotFoundException(`Recipient user ${recipientUserId} not found`);
    if (recipient.role !== Role.USER) {
      throw new BadRequestException('Bracelets can only be assigned to USER-role accounts');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: recipientUserId },
        data: {
          balanceBlack: { increment: black },
          balanceWhite: { increment: white },
          balanceRed: { increment: red },
          balanceBlue: { increment: blue },
          balanceVersion: { increment: 1 },
        },
      });

      const creation = await tx.warehouseCreation.create({
        data: {
          recipientUserId,
          black, white, red, blue,
          totalAmount: black + white + red + blue,
          createdBy: actorId,
          notes: notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'BALANCE_TOPUP',
          entityType: 'User',
          entityId: recipientUserId,
          actorId,
          metadata: { black, white, red, blue, totalAmount: black + white + red + blue, notes, recipientUserId },
        },
      });

      this.logger.log(`Bracelets created for ${recipient.displayName} — B:${black} W:${white} R:${red} BL:${blue} by ${actorId}`);
      await this.redis.del(`balance:user:${recipientUserId}`);
      return creation;
    });
  }

  async getWarehouseCreationHistory(params: {
    recipientUserId?: string;
    page?: number;
    limit?: number;
  }) {
    const { recipientUserId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseCreationWhereInput = {};
    if (recipientUserId) where.recipientUserId = recipientUserId;

    const [creations, total] = await Promise.all([
      this.prisma.warehouseCreation.findMany({
        where,
        include: {
          recipientUser: {
            select: {
              id: true, username: true, displayName: true,
              primaryCity: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.warehouseCreation.count({ where }),
    ]);

    const userIds = [...new Set(creations.map((c) => c.createdBy).filter(Boolean))] as string[];
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, role: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: creations.map((c) => ({ ...c, createdByUser: userMap.get(c.createdBy) ?? null })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ────────────────────────────────────────────────
  // MAP DATA
  // ────────────────────────────────────────────────

  async getMapData(user: { role: Role; officeId?: string | null; primaryCityId?: string | null }) {
    const { role, officeId, primaryCityId } = user;

    const cityWhere: Prisma.CityWhereInput = {};
    if (role === Role.USER && primaryCityId) {
      const myCity = await this.prisma.city.findUnique({ where: { id: primaryCityId }, select: { countryId: true } });
      if (myCity) cityWhere.countryId = myCity.countryId;
    }
    if (role === Role.OFFICE && officeId) {
      cityWhere.country = { officeId };
    }

    const cities = await this.prisma.city.findMany({
      where: cityWhere,
      include: { country: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });

    const cityData = await Promise.all(
      cities
        .filter((c) => c.latitude && c.longitude)
        .map(async (city) => {
          const agg = await this.prisma.user.aggregate({
            where: { primaryCityId: city.id, isActive: true, role: Role.USER },
            _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
          });
          const black = agg._sum.balanceBlack ?? 0;
          const white = agg._sum.balanceWhite ?? 0;
          const red = agg._sum.balanceRed ?? 0;
          const blue = agg._sum.balanceBlue ?? 0;
          return {
            id: city.id, name: city.name, slug: city.slug,
            status: city.status,
            latitude: city.latitude, longitude: city.longitude,
            countryId: city.countryId,
            countryName: city.country?.name || '',
            countryCode: city.country?.code || '',
            balance: { BLACK: black, WHITE: white, RED: red, BLUE: blue },
            totalStock: black + white + red + blue,
          };
        }),
    );

    const since = new Date();
    since.setDate(since.getDate() - 90);

    const recentTransfers = await this.prisma.transfer.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['SENT', 'ACCEPTED', 'DISCREPANCY_FOUND'] },
      },
      select: {
        id: true, status: true, createdAt: true, notes: true,
        fromUserId: true, toUserId: true,
        fromUser: {
          select: {
            id: true, displayName: true,
            primaryCity: { select: { id: true, name: true, latitude: true, longitude: true, countryId: true } },
          },
        },
        toUser: {
          select: {
            id: true, displayName: true,
            primaryCity: { select: { id: true, name: true, latitude: true, longitude: true, countryId: true } },
          },
        },
        items: { select: { itemType: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const transferData = recentTransfers
      .filter((t) => {
        const fc = t.fromUser?.primaryCity;
        const tc = t.toUser?.primaryCity;
        return fc?.latitude && tc?.latitude && fc.latitude !== 0 && tc.latitude !== 0;
      })
      .map((t) => {
        const fc = t.fromUser!.primaryCity!;
        const tc = t.toUser!.primaryCity!;
        return {
          id: t.id, status: t.status, createdAt: t.createdAt,
          senderName: t.fromUser?.displayName || '—',
          receiverName: t.toUser?.displayName || '—',
          senderCityId: fc.id, receiverCityId: tc.id,
          senderCountryId: fc.countryId, receiverCountryId: tc.countryId,
          fromLat: fc.latitude!, fromLng: fc.longitude!,
          toLat: tc.latitude!, toLng: tc.longitude!,
          volume: t.items.reduce((s, i) => s + i.quantity, 0),
          items: t.items,
        };
      });

    const lineMap = new Map<string, { fromLat: number; fromLng: number; toLat: number; toLng: number; volume: number }>();
    for (const t of transferData) {
      const key = `${t.fromLat},${t.fromLng}-${t.toLat},${t.toLng}`;
      const existing = lineMap.get(key);
      if (existing) existing.volume += t.volume;
      else lineMap.set(key, { fromLat: t.fromLat, fromLng: t.fromLng, toLat: t.toLat, toLng: t.toLng, volume: t.volume });
    }

    const countryWhere: Prisma.CountryWhereInput = {};
    if (role === Role.OFFICE && officeId) countryWhere.officeId = officeId;
    if (role === Role.USER && primaryCityId) {
      const myCity = cities.find((c) => c.id === primaryCityId);
      if (myCity) countryWhere.id = myCity.countryId;
    }

    const countries = await this.prisma.country.findMany({
      where: countryWhere,
      select: { id: true, name: true, code: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    });

    const countryData = countries.map((country) => {
      const cc = cityData.filter((c) => c.countryId === country.id);
      const bal = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
      for (const c of cc) { bal.BLACK += c.balance.BLACK; bal.WHITE += c.balance.WHITE; bal.RED += c.balance.RED; bal.BLUE += c.balance.BLUE; }
      return { ...country, balance: bal, totalStock: bal.BLACK + bal.WHITE + bal.RED + bal.BLUE, cityCount: cc.length };
    });

    return { cities: cityData, countries: countryData, transferLines: Array.from(lineMap.values()), transfers: transferData };
  }

  // ────────────────────────────────────────────────
  // CITY STATUS — based on aggregate user balances
  // ────────────────────────────────────────────────

  async updateCityStatus(tx: Prisma.TransactionClient, cityId: string): Promise<void> {
    const agg = await tx.user.aggregate({
      where: { primaryCityId: cityId, isActive: true, role: Role.USER },
      _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
    });
    const total = (agg._sum.balanceBlack ?? 0) + (agg._sum.balanceWhite ?? 0)
      + (agg._sum.balanceRed ?? 0) + (agg._sum.balanceBlue ?? 0);

    const newStatus: CityStatus = total === 0 ? CityStatus.INACTIVE : total < 200 ? CityStatus.LOW : CityStatus.ACTIVE;

    const city = await tx.city.findUnique({
      where: { id: cityId },
      include: { country: { select: { name: true } } },
    });
    if (city && city.status !== newStatus) {
      await tx.city.update({ where: { id: cityId }, data: { status: newStatus } });
      this.logger.log(`City ${cityId} status: ${city.status} → ${newStatus} (total=${total})`);
      if (newStatus === CityStatus.LOW) {
        this.eventEmitter.emit('city.lowStock', { cityId, cityName: city.name, countryName: city.country?.name || '', total });
      } else if (newStatus === CityStatus.INACTIVE) {
        this.eventEmitter.emit('city.zeroStock', { cityId, cityName: city.name, countryName: city.country?.name || '' });
      }
    }
  }

  // ────────────────────────────────────────────────
  // COMPANY LOSSES
  // ────────────────────────────────────────────────

  async getCompanyLossesSummary(filters?: { cityId?: string; countryId?: string }) {
    try {
      const where: Prisma.CompanyLossWhereInput = {};
      if (filters?.cityId) {
        where.transfer = {
          OR: [
            { fromUser: { primaryCityId: filters.cityId } },
            { toUser: { primaryCityId: filters.cityId } },
          ],
        };
      } else if (filters?.countryId) {
        where.transfer = {
          OR: [
            { fromUser: { primaryCity: { countryId: filters.countryId } } },
            { toUser: { primaryCity: { countryId: filters.countryId } } },
          ],
        };
      }
      const losses = await this.prisma.companyLoss.findMany({ where });
      const summary = { total: 0, black: 0, white: 0, red: 0, blue: 0, count: losses.length };
      for (const loss of losses) {
        summary.total += loss.totalAmount ?? 0;
        summary.black += loss.black ?? 0;
        summary.white += loss.white ?? 0;
        summary.red += loss.red ?? 0;
        summary.blue += loss.blue ?? 0;
      }
      return summary;
    } catch (error: any) {
      this.logger.error(`getCompanyLossesSummary ERROR: ${error?.message}`);
      return { total: 0, black: 0, white: 0, red: 0, blue: 0, count: 0 };
    }
  }

  async getCompanyLosses(params: {
    page?: number; limit?: number; startDate?: string; endDate?: string; search?: string;
  }) {
    const { page = 1, limit = 20, startDate, endDate, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyLossWhereInput = {};
    if (startDate) (where as any).resolvedAt = { ...(where as any).resolvedAt, gte: new Date(startDate) };
    if (endDate) (where as any).resolvedAt = { ...(where as any).resolvedAt, lte: new Date(endDate) };
    if (search) {
      where.OR = [
        { senderName: { contains: search, mode: 'insensitive' } },
        { receiverName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [losses, total] = await Promise.all([
      this.prisma.companyLoss.findMany({
        where,
        include: {
          transfer: {
            select: {
              id: true, status: true,
              fromUser: { select: { id: true, displayName: true, primaryCity: { select: { id: true, name: true } } } },
              toUser: { select: { id: true, displayName: true, primaryCity: { select: { id: true, name: true } } } },
            },
          },
          resolver: { select: { id: true, displayName: true, username: true } },
        },
        orderBy: { resolvedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.companyLoss.count({ where }),
    ]);

    return { data: losses, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ────────────────────────────────────────────────
  // SYSTEM MINUS  (Created total – Sum of all user balances)
  // ────────────────────────────────────────────────

  async getSystemMinusSummary() {
    try {
      const creationAgg = await this.prisma.warehouseCreation.aggregate({
        _sum: { black: true, white: true, red: true, blue: true },
      });
      const created = {
        black: creationAgg._sum.black ?? 0,
        white: creationAgg._sum.white ?? 0,
        red: creationAgg._sum.red ?? 0,
        blue: creationAgg._sum.blue ?? 0,
      };

      const userAgg = await this.prisma.user.aggregate({
        where: { role: Role.USER, isActive: true },
        _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
      });
      const bals = {
        black: userAgg._sum.balanceBlack ?? 0,
        white: userAgg._sum.balanceWhite ?? 0,
        red: userAgg._sum.balanceRed ?? 0,
        blue: userAgg._sum.balanceBlue ?? 0,
      };

      const diff = {
        black: created.black - bals.black,
        white: created.white - bals.white,
        red: created.red - bals.red,
        blue: created.blue - bals.blue,
        total: 0,
        totalCreated: created.black + created.white + created.red + created.blue,
        totalBalances: bals.black + bals.white + bals.red + bals.blue,
      };
      diff.total = diff.black + diff.white + diff.red + diff.blue;
      return diff;
    } catch (error: any) {
      this.logger.error(`getSystemMinusSummary ERROR: ${error?.message}`);
      return { black: 0, white: 0, red: 0, blue: 0, total: 0, totalCreated: 0, totalBalances: 0 };
    }
  }

  async getSystemLossesSummary() {
    try {
      const summary = { total: 0, black: 0, white: 0, red: 0, blue: 0, companyCount: 0, shortageCount: 0 };

      const companyLosses = await this.prisma.companyLoss.findMany({
        select: { totalAmount: true, black: true, white: true, red: true, blue: true },
      });
      summary.companyCount = companyLosses.length;
      for (const l of companyLosses) {
        summary.total += l.totalAmount ?? 0;
        summary.black += l.black ?? 0;
        summary.white += l.white ?? 0;
        summary.red += l.red ?? 0;
        summary.blue += l.blue ?? 0;
      }

      const shortages = await this.prisma.shortage.findMany({
        select: { totalAmount: true, black: true, white: true, red: true, blue: true },
      });
      summary.shortageCount = shortages.length;
      for (const s of shortages) {
        summary.total += s.totalAmount ?? 0;
        summary.black += s.black ?? 0;
        summary.white += s.white ?? 0;
        summary.red += s.red ?? 0;
        summary.blue += s.blue ?? 0;
      }

      return summary;
    } catch (error: any) {
      this.logger.error(`getSystemLossesSummary ERROR: ${error?.message}`);
      return { total: 0, black: 0, white: 0, red: 0, blue: 0, companyCount: 0, shortageCount: 0 };
    }
  }
}
