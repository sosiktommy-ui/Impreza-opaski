import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CityStatus,
  ExpenseType,
  NotificationType,
  Prisma,
  Role,
  WarehouseTargetKind,
} from '@prisma/client';
import { BalancesService } from '../balances/balances.service';
import { AccessService } from '../access/access.service';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly balances: BalancesService,
    private readonly access: AccessService,
  ) {}

  // ────────────────────────────────────────────────
  // CITY BALANCE  (aggregate of all USER balances in city)
  // ────────────────────────────────────────────────

  async getUserBalance(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
    });
    if (!u) return { black: 0, white: 0, red: 0, blue: 0, total: 0 };
    const total = u.balanceBlack + u.balanceWhite + u.balanceRed + u.balanceBlue;
    return { black: u.balanceBlack, white: u.balanceWhite, red: u.balanceRed, blue: u.balanceBlue, total };
  }

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
    black: number;
    white: number;
    red: number;
    blue: number;
    notes?: string;
    actorId: string;
  }) {
    const {
      cityId, userId, eventName, eventDate, location,
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
        id: true, role: true, primaryCityId: true,
        balanceBlack: true, balanceWhite: true,
        balanceRed: true, balanceBlue: true, balanceVersion: true,
      },
    });
    if (!creator) throw new NotFoundException(`User ${userId} not found`);
    if (creator.role !== Role.USER) {
      throw new BadRequestException('Only USER-role accounts can have expenses deducted');
    }

    // Auto-compute expense kind from primary city vs target city.
    const isInternal = creator.primaryCityId === cityId;
    const expenseType: ExpenseType = isInternal ? ExpenseType.INTERNAL : ExpenseType.EXTERNAL;

    // For EXTERNAL expense, the creator must have explicit access to that city.
    if (!isInternal) {
      const allowed = await this.access.hasAccessToCity(userId, cityId);
      if (!allowed) {
        throw new ForbiddenException(
          `User has no access to city ${city.name} — external expense not allowed`,
        );
      }
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
          type: expenseType,
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
          metadata: { eventName, cityId, userId, kind: expenseType, black, white, red, blue },
        },
      });

      this.logger.log(`Expense (${expenseType}): ${eventName} in ${city.name} by user ${userId} — B:${black} W:${white} R:${red} BL:${blue}`);
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
  // WAREHOUSE — create bracelets (mint into ADMIN or OFFICE pool)
  // ────────────────────────────────────────────────

  async createBracelets(params: {
    targetKind: 'ADMIN_SELF' | 'OFFICE';
    officeId?: string;
    black: number;
    white: number;
    red: number;
    blue: number;
    notes?: string;
    actor: { id: string; role: Role; officeId: string | null };
  }) {
    const { targetKind, officeId, black, white, red, blue, notes, actor } = params;

    if (black <= 0 && white <= 0 && red <= 0 && blue <= 0) {
      throw new BadRequestException('At least one bracelet color must have quantity > 0');
    }

    // Authorize
    if (actor.role === Role.ADMIN) {
      // ADMIN can mint into self OR any office
      if (targetKind === 'OFFICE' && !officeId) {
        throw new BadRequestException('officeId is required for OFFICE target');
      }
    } else if (actor.role === Role.OFFICE) {
      // OFFICE may only mint into their own office
      if (targetKind !== 'OFFICE') {
        throw new ForbiddenException('OFFICE role may only mint into its own office');
      }
      if (!actor.officeId) {
        throw new ForbiddenException('OFFICE user has no office assigned');
      }
      if (officeId && officeId !== actor.officeId) {
        throw new ForbiddenException('OFFICE user may only mint into its own office');
      }
    } else {
      throw new ForbiddenException('Only ADMIN or OFFICE may mint bracelets');
    }

    const effectiveOfficeId =
      targetKind === 'OFFICE'
        ? (actor.role === Role.OFFICE ? (actor.officeId as string) : (officeId as string))
        : null;

    const totalAmount = black + white + red + blue;

    return this.prisma.$transaction(async (tx) => {
      let recipientUserId: string | null = null;
      let recipientOfficeName: string | null = null;

      if (targetKind === 'ADMIN_SELF') {
        // Credit the acting admin's own User row.
        await tx.user.update({
          where: { id: actor.id },
          data: {
            balanceBlack: { increment: black },
            balanceWhite: { increment: white },
            balanceRed: { increment: red },
            balanceBlue: { increment: blue },
            balanceVersion: { increment: 1 },
          },
        });
        recipientUserId = actor.id;
      } else {
        // OFFICE target — credit the Office balance pool with optimistic lock.
        const office = await tx.office.findUnique({
          where: { id: effectiveOfficeId! },
          select: { id: true, name: true, balanceVersion: true },
        });
        if (!office) throw new NotFoundException('Office not found');
        const ok = await tx.office.updateMany({
          where: { id: office.id, balanceVersion: office.balanceVersion },
          data: {
            balanceBlack: { increment: black },
            balanceWhite: { increment: white },
            balanceRed: { increment: red },
            balanceBlue: { increment: blue },
            balanceVersion: { increment: 1 },
          },
        });
        if (ok.count === 0) {
          throw new BadRequestException('Office balance changed, please retry');
        }
        recipientOfficeName = office.name;
      }

      const creation = await tx.warehouseCreation.create({
        data: {
          recipientKind:
            targetKind === 'ADMIN_SELF'
              ? WarehouseTargetKind.ADMIN_SELF
              : WarehouseTargetKind.OFFICE,
          recipientUserId: recipientUserId ?? undefined,
          recipientOfficeId: effectiveOfficeId ?? undefined,
          black,
          white,
          red,
          blue,
          totalAmount,
          createdBy: actor.id,
          notes: notes || null,
        },
      });

      // Audit log
      const isOfficeSelfMint = actor.role === Role.OFFICE && targetKind === 'OFFICE';
      await tx.auditLog.create({
        data: {
          action: isOfficeSelfMint
            ? 'OFFICE_SELF_MINT'
            : 'WAREHOUSE_MINT',
          entityType: targetKind === 'ADMIN_SELF' ? 'User' : 'Office',
          entityId: (targetKind === 'ADMIN_SELF' ? actor.id : effectiveOfficeId) as string,
          actorId: actor.id,
          metadata: {
            targetKind,
            officeId: effectiveOfficeId,
            black, white, red, blue, totalAmount,
            notes,
          },
        },
      });

      // Notify all active admins when an OFFICE user self-mints.
      if (isOfficeSelfMint) {
        const admins = await tx.user.findMany({
          where: { role: Role.ADMIN, isActive: true },
          select: { id: true },
        });
        if (admins.length > 0) {
          await tx.notification.createMany({
            data: admins.map((a) => ({
              userId: a.id,
              type: NotificationType.OFFICE_SELF_MINT,
              title: 'Офис создал опаски',
              message: `Офис ${recipientOfficeName ?? ''} пополнил баланс: Ч:${black} Б:${white} К:${red} С:${blue}`,
              metadata: {
                officeId: effectiveOfficeId,
                actorId: actor.id,
                black, white, red, blue, totalAmount,
              },
            })),
          });
        }
      }

      this.logger.log(
        `Bracelets minted (${targetKind}${effectiveOfficeId ? ` office=${effectiveOfficeId}` : ''}) — B:${black} W:${white} R:${red} BL:${blue} by ${actor.id}`,
      );

      if (recipientUserId) {
        await this.redis.del(`balance:user:${recipientUserId}`);
      }
      return creation;
    });
  }

  async getWarehouseCreationHistory(params: {
    recipientUserId?: string;
    recipientOfficeId?: string;
    recipientKind?: 'ADMIN_SELF' | 'OFFICE';
    page?: number;
    limit?: number;
  }) {
    const { recipientUserId, recipientOfficeId, recipientKind, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseCreationWhereInput = {};
    if (recipientUserId) where.recipientUserId = recipientUserId;
    if (recipientOfficeId) where.recipientOfficeId = recipientOfficeId;
    if (recipientKind) {
      where.recipientKind =
        recipientKind === 'ADMIN_SELF'
          ? WarehouseTargetKind.ADMIN_SELF
          : WarehouseTargetKind.OFFICE;
    }

    const [creations, total] = await Promise.all([
      this.prisma.warehouseCreation.findMany({
        where,
        include: {
          recipientUser: {
            select: {
              id: true, username: true, displayName: true, role: true,
              primaryCity: { select: { id: true, name: true, slug: true } },
            },
          },
          recipientOffice: {
            select: { id: true, name: true, code: true },
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
      const adminAgg = await this.prisma.user.aggregate({
        where: { role: Role.ADMIN, isActive: true },
        _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
      });
      const officeAgg = await this.prisma.office.aggregate({
        _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
      });
      const bals = {
        black:
          (userAgg._sum.balanceBlack ?? 0) +
          (adminAgg._sum.balanceBlack ?? 0) +
          (officeAgg._sum.balanceBlack ?? 0),
        white:
          (userAgg._sum.balanceWhite ?? 0) +
          (adminAgg._sum.balanceWhite ?? 0) +
          (officeAgg._sum.balanceWhite ?? 0),
        red:
          (userAgg._sum.balanceRed ?? 0) +
          (adminAgg._sum.balanceRed ?? 0) +
          (officeAgg._sum.balanceRed ?? 0),
        blue:
          (userAgg._sum.balanceBlue ?? 0) +
          (adminAgg._sum.balanceBlue ?? 0) +
          (officeAgg._sum.balanceBlue ?? 0),
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

  // ────────────────────────────────────────────────
  // INVENTORY OVERVIEW  (sum of all user balances, formatted as old itemType rows)
  // ────────────────────────────────────────────────

  async getInventoryOverview(params: { countryId?: string; cityId?: string }) {
    try {
      const { countryId, cityId } = params;

      // ── 1. Per-city USER balance aggregation ────────────────────────
      const userWhere: Prisma.UserWhereInput = { role: Role.USER, isActive: true };
      if (cityId) userWhere.primaryCityId = cityId;
      else if (countryId) userWhere.primaryCity = { countryId };

      const users = await this.prisma.user.findMany({
        where: userWhere,
        select: {
          primaryCityId: true,
          primaryCity: { select: { id: true, name: true, countryId: true } },
          balanceBlack: true,
          balanceWhite: true,
          balanceRed: true,
          balanceBlue: true,
        },
      });

      // Aggregate by city
      const cityMap = new Map<string, { city: { id: string; name: string; countryId: string }; BLACK: number; WHITE: number; RED: number; BLUE: number }>();
      for (const u of users) {
        if (!u.primaryCityId || !u.primaryCity) continue;
        const cid = u.primaryCityId;
        if (!cityMap.has(cid)) {
          cityMap.set(cid, { city: u.primaryCity, BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
        }
        const entry = cityMap.get(cid)!;
        entry.BLACK += u.balanceBlack;
        entry.WHITE += u.balanceWhite;
        entry.RED   += u.balanceRed;
        entry.BLUE  += u.balanceBlue;
      }

      const cityRows: any[] = [];
      for (const [, entry] of cityMap) {
        for (const itemType of ['BLACK', 'WHITE', 'RED', 'BLUE'] as const) {
          cityRows.push({
            entityType: 'CITY',
            city: entry.city,
            itemType,
            quantity: entry[itemType],
          });
        }
      }

      // ── 2. ADMIN balance rows ────────────────────────────────────────
      const adminWhere: Prisma.UserWhereInput = { role: Role.ADMIN, isActive: true };
      if (countryId || cityId) {
        // For filtered views don't include admin global pool
      } else {
        const adminAgg = await this.prisma.user.aggregate({
          where: adminWhere,
          _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
        });
        const adminQty: Record<string, number> = {
          BLACK: adminAgg._sum.balanceBlack ?? 0,
          WHITE: adminAgg._sum.balanceWhite ?? 0,
          RED:   adminAgg._sum.balanceRed   ?? 0,
          BLUE:  adminAgg._sum.balanceBlue  ?? 0,
        };
        for (const itemType of ['BLACK', 'WHITE', 'RED', 'BLUE'] as const) {
          cityRows.push({
            entityType: 'ADMIN',
            itemType,
            quantity: adminQty[itemType],
          });
        }

        // ── 3. OFFICE balance rows ─────────────────────────────────────
        const offices = await this.prisma.office.findMany({
          select: { id: true, name: true, balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
        });
        for (const office of offices) {
          for (const itemType of ['BLACK', 'WHITE', 'RED', 'BLUE'] as const) {
            const key = `balance${itemType.charAt(0) + itemType.slice(1).toLowerCase()}` as keyof typeof office;
            cityRows.push({
              entityType: 'OFFICE',
              officeId: office.id,
              office: { name: office.name },
              itemType,
              quantity: (office[key] as number) ?? 0,
            });
          }
        }
      }

      return { data: cityRows };
    } catch (error: any) {
      this.logger.error(`getInventoryOverview ERROR: ${error?.message}`);
      return { data: [] };
    }
  }

  // ────────────────────────────────────────────────
  // WAREHOUSE BALANCE  (admin pool or office pool)
  // ────────────────────────────────────────────────

  async getWarehouseBalance(officeId?: string) {
    try {
      if (officeId) {
        const office = await this.prisma.office.findUnique({
          where: { id: officeId },
          select: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
        });
        if (!office) return { black: 0, white: 0, red: 0, blue: 0, total: 0 };
        const total = office.balanceBlack + office.balanceWhite + office.balanceRed + office.balanceBlue;
        return { black: office.balanceBlack, white: office.balanceWhite, red: office.balanceRed, blue: office.balanceBlue, total };
      }

      // No officeId: total of all admin balances + all office balances
      const [adminAgg, officeAgg] = await Promise.all([
        this.prisma.user.aggregate({
          where: { role: Role.ADMIN, isActive: true },
          _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
        }),
        this.prisma.office.aggregate({
          _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
        }),
      ]);

      const black = (adminAgg._sum.balanceBlack ?? 0) + (officeAgg._sum.balanceBlack ?? 0);
      const white = (adminAgg._sum.balanceWhite ?? 0) + (officeAgg._sum.balanceWhite ?? 0);
      const red   = (adminAgg._sum.balanceRed ?? 0)   + (officeAgg._sum.balanceRed ?? 0);
      const blue  = (adminAgg._sum.balanceBlue ?? 0)  + (officeAgg._sum.balanceBlue ?? 0);
      return { black, white, red, blue, total: black + white + red + blue };
    } catch (error: any) {
      this.logger.error(`getWarehouseBalance ERROR: ${error?.message}`);
      return { black: 0, white: 0, red: 0, blue: 0, total: 0 };
    }
  }

  // ────────────────────────────────────────────────
  // SYSTEM LOSSES  (paginated company losses list)
  // ────────────────────────────────────────────────

  async getSystemLossesList(params: {
    page?: number; limit?: number; countryId?: string; cityId?: string; search?: string;
  }) {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyLossWhereInput = {};
    if (search) {
      where.OR = [
        { senderName: { contains: search, mode: 'insensitive' } },
        { receiverName: { contains: search, mode: 'insensitive' } },
      ];
    }

    try {
      const [losses, total] = await Promise.all([
        this.prisma.companyLoss.findMany({
          where,
          include: {
            transfer: {
              select: {
                id: true, status: true,
                fromUser: { select: { id: true, displayName: true } },
                toUser:   { select: { id: true, displayName: true } },
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
    } catch (error: any) {
      this.logger.error(`getSystemLossesList ERROR: ${error?.message}`);
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
  }
}
