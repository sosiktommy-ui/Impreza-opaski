import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BALANCE_COLORS, BalanceColor } from './dto/adjust-balance.dto';

const COLOR_TO_FIELD: Record<BalanceColor, keyof BalanceFieldMap> = {
  BLACK: 'balanceBlack',
  WHITE: 'balanceWhite',
  RED: 'balanceRed',
  BLUE: 'balanceBlue',
};

interface BalanceFieldMap {
  balanceBlack: number;
  balanceWhite: number;
  balanceRed: number;
  balanceBlue: number;
}

interface ListFilters {
  search?: string;
  cityId?: string;
  officeId?: string;
}

@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Format raw user balance fields into a stable response shape. */
  private format(user: {
    id: string;
    balanceBlack: number;
    balanceWhite: number;
    balanceRed: number;
    balanceBlue: number;
    balanceVersion: number;
  }) {
    return {
      userId: user.id,
      black: user.balanceBlack,
      white: user.balanceWhite,
      red: user.balanceRed,
      blue: user.balanceBlue,
      version: user.balanceVersion,
      total:
        user.balanceBlack +
        user.balanceWhite +
        user.balanceRed +
        user.balanceBlue,
    };
  }

  /** GET /balances/me вЂ” caller's own balance. USER role. */
  async getMine(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        balanceBlack: true,
        balanceWhite: true,
        balanceRed: true,
        balanceBlue: true,
        balanceVersion: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.USER) {
      // ADMIN/OFFICE don't carry personal balances.
      return null;
    }
    return this.format(user);
  }

  /** GET /balances/users/:userId вЂ” view any user's balance. */
  async getForUser(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        balanceBlack: true,
        balanceWhite: true,
        balanceRed: true,
        balanceBlue: true,
        balanceVersion: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.format(user);
  }

  /**
   * GET /balances/city/:cityId
   * Aggregate balance for a city = SUM of all active USER balances with primaryCityId=cityId.
   */
  async getCityBalance(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true, name: true, slug: true },
    });
    if (!city) throw new NotFoundException('City not found');

    const agg = await this.prisma.user.aggregate({
      where: { primaryCityId: cityId, isActive: true, role: Role.USER },
      _sum: {
        balanceBlack: true,
        balanceWhite: true,
        balanceRed: true,
        balanceBlue: true,
      },
    });

    const black = agg._sum.balanceBlack ?? 0;
    const white = agg._sum.balanceWhite ?? 0;
    const red = agg._sum.balanceRed ?? 0;
    const blue = agg._sum.balanceBlue ?? 0;

    return {
      cityId,
      city,
      black,
      white,
      red,
      blue,
      total: black + white + red + blue,
    };
  }

  /**
   * GET /balances/country/:countryId
   * Aggregate balance for a country = SUM of all cities' aggregates.
   */
  async getCountryBalance(countryId: string) {
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: { id: true, name: true, code: true, cities: { select: { id: true, name: true, slug: true } } },
    });
    if (!country) throw new NotFoundException('Country not found');

    const cityIds = country.cities.map((c) => c.id);

    const agg = await this.prisma.user.aggregate({
      where: { primaryCityId: { in: cityIds }, isActive: true, role: Role.USER },
      _sum: {
        balanceBlack: true,
        balanceWhite: true,
        balanceRed: true,
        balanceBlue: true,
      },
    });

    const black = agg._sum.balanceBlack ?? 0;
    const white = agg._sum.balanceWhite ?? 0;
    const red = agg._sum.balanceRed ?? 0;
    const blue = agg._sum.balanceBlue ?? 0;

    // Per-city breakdown
    const cityBreakdown = await Promise.all(
      country.cities.map(async (city) => {
        const cityAgg = await this.prisma.user.aggregate({
          where: { primaryCityId: city.id, isActive: true, role: Role.USER },
          _sum: { balanceBlack: true, balanceWhite: true, balanceRed: true, balanceBlue: true },
        });
        const cb = cityAgg._sum.balanceBlack ?? 0;
        const cw = cityAgg._sum.balanceWhite ?? 0;
        const cr = cityAgg._sum.balanceRed ?? 0;
        const cbl = cityAgg._sum.balanceBlue ?? 0;
        return { cityId: city.id, city, black: cb, white: cw, red: cr, blue: cbl, total: cb + cw + cr + cbl };
      }),
    );

    return {
      countryId,
      country: { id: country.id, name: country.name, code: country.code },
      black,
      white,
      red,
      blue,
      total: black + white + red + blue,
      cities: cityBreakdown,
    };
  }

  /** GET /balances вЂ” paginated list of USER accounts, ADMIN/OFFICE only. */
  async list(filters: ListFilters & { page?: number; limit?: number }) {
    const { search, cityId, officeId } = filters;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      isActive: true,
      role: Role.USER,
    };
    if (cityId) where.primaryCityId = cityId;
    if (officeId) {
      // Filter users whose primaryCity belongs to a country in this office
      where.primaryCity = { country: { officeId } };
    }
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          primaryCityId: true,
          balanceBlack: true,
          balanceWhite: true,
          balanceRed: true,
          balanceBlue: true,
          balanceVersion: true,
          primaryCity: {
            select: {
              id: true,
              name: true,
              slug: true,
              country: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: [{ displayName: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((u) => ({
        ...this.format(u),
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        primaryCity: u.primaryCity,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** POST /balances/adjust вЂ” manual correction. ADMIN/OFFICE only. */
  async adjust(params: {
    userId: string;
    color: BalanceColor;
    delta: number;
    reason: string;
    actorId: string;
  }) {
    const { userId, color, delta, reason, actorId } = params;
    if (delta === 0) throw new BadRequestException('Delta cannot be zero');
    if (!BALANCE_COLORS.includes(color)) {
      throw new BadRequestException(`Invalid color: ${color}`);
    }

    const field = COLOR_TO_FIELD[color];

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          balanceBlack: true,
          balanceWhite: true,
          balanceRed: true,
          balanceBlue: true,
          balanceVersion: true,
        },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.role !== Role.USER) {
        throw new BadRequestException('Only USER-role accounts have personal balances');
      }

      const before = user[field];
      const after = before + delta;
      if (after < 0) {
        throw new BadRequestException(
          `Insufficient ${color}: have ${before}, delta ${delta}`,
        );
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          [field]: after,
          balanceVersion: { increment: 1 },
        },
      });

      await tx.adjustment.create({
        data: {
          userId,
          itemType: color as any,
          delta,
          reason,
          createdBy: actorId,
        },
      });

      this.logger.log(
        `Balance adjusted: user ${userId} ${color} ${delta > 0 ? '+' : ''}${delta} (${before} в†’ ${after}) by ${actorId}`,
      );

      this.eventEmitter.emit('balance.adjusted', {
        actorId,
        userId,
        color,
        delta,
        before,
        after,
        reason,
      });

      return {
        ...this.format({
          ...user,
          [field]: after,
          balanceVersion: user.balanceVersion + 1,
        } as any),
        delta,
        reason,
      };
    });
  }

  /**
   * GET /balances/users/:userId/history вЂ” timeline of audit events
   * affecting this user's personal balance.
   */
  async getHistory(targetUserId: string, params: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { action: 'BALANCE_ADJUSTED', entityType: 'User', entityId: targetUserId },
        {
          action: { in: ['EXPENSE_CREATED', 'EXPENSE_DELETED'] },
          metadata: { path: ['userId'], equals: targetUserId },
        },
        {
          action: {
            in: [
              'TRANSFER_SENT',
              'TRANSFER_ACCEPTED',
              'TRANSFER_REJECTED',
              'TRANSFER_CANCELLED',
              'DISCREPANCY_DETECTED',
            ],
          },
          metadata: { path: ['affectedUserIds'], array_contains: targetUserId },
        },
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, username: true, displayName: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        createdAt: r.createdAt,
        actor: r.actor,
        metadata: r.metadata,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}

