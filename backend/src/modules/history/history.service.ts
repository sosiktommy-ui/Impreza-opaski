import { Injectable } from '@nestjs/common';
import { AuditAction, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { visibleCityIds, visibleCountryIds } from '../../common/auth/scope.util';

export interface HistoryFilter {
  tab?: 'all' | 'mine' | 'country' | 'city' | 'user';
  userId?: string;
  cityId?: string;
  countryId?: string;
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string; // id of last seen
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(user: AuthUser, f: HistoryFilter) {
    const allowedCities = await visibleCityIds(this.prisma, user);
    const allowedCountries = await visibleCountryIds(this.prisma, user);

    const where: any = {};
    if (f.action) where.action = f.action;
    if (f.dateFrom || f.dateTo) {
      where.createdAt = {};
      if (f.dateFrom) where.createdAt.gte = new Date(f.dateFrom);
      if (f.dateTo) where.createdAt.lte = new Date(f.dateTo);
    }
    if (f.userId) where.userId = f.userId;
    if (f.tab === 'mine') where.userId = user.id;

    // scope-based pre-filter (for non-global roles)
    const scopeOR: any[] = [];
    if (allowedCities !== null) {
      // include events where user acted (their own)
      scopeOR.push({ userId: user.id });
      if (allowedCities.length > 0) {
        for (const id of allowedCities) {
          scopeOR.push({ payload: { path: ['cityId'], equals: id } });
        }
      }
      if (allowedCountries && allowedCountries.length > 0) {
        for (const id of allowedCountries) {
          scopeOR.push({ payload: { path: ['countryId'], equals: id } });
          scopeOR.push({ payload: { path: ['fromCountryId'], equals: id } });
          scopeOR.push({ payload: { path: ['toCountryId'], equals: id } });
        }
      }
      if (scopeOR.length > 0) where.OR = scopeOR;
    }

    // explicit cityId/countryId filter from request (works for any role)
    const explicitAnd: any[] = [];
    if (f.cityId) {
      explicitAnd.push({
        OR: [
          { payload: { path: ['cityId'], equals: f.cityId } },
          { payload: { path: ['fromCityId'], equals: f.cityId } },
          { payload: { path: ['toCityId'], equals: f.cityId } },
        ],
      });
    }
    if (f.countryId) {
      explicitAnd.push({
        OR: [
          { payload: { path: ['countryId'], equals: f.countryId } },
          { payload: { path: ['fromCountryId'], equals: f.countryId } },
          { payload: { path: ['toCountryId'], equals: f.countryId } },
        ],
      });
    }
    if (explicitAnd.length > 0) where.AND = explicitAnd;

    const limit = Math.min(f.limit ?? 100, 500);

    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });

    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;

    return {
      items: slice.map((it) => ({
        id: it.id,
        action: it.action,
        actor: it.user
          ? {
              id: it.user.id,
              username: it.user.username,
              displayName: it.user.displayName,
              role: it.user.role,
            }
          : null,
        entityType: it.entityType,
        entityId: it.entityId,
        payload: it.payload,
        createdAt: it.createdAt,
      })),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  }
}
