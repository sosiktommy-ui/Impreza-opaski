import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EntityType,
  ItemType,
  Prisma,
  Role,
  ScopeType,
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
  role?: Role;
  countryId?: string;
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

  /** GET /balances/me — caller's own balance. CITY/COUNTRY only. */
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
    if (user.role !== Role.CITY && user.role !== Role.COUNTRY) {
      // ADMIN/OFFICE don't carry personal balances yet.
      return null;
    }
    return this.format(user);
  }

  /** GET /balances/users/:userId — admin/office/country can view. */
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

  /** GET /balances — paginated list, ADMIN/OFFICE only. */
  async list(filters: ListFilters & { page?: number; limit?: number }) {
    const { search, role, countryId, officeId } = filters;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      isActive: true,
      role: { in: role ? [role] : [Role.CITY, Role.COUNTRY] },
    };
    if (countryId) where.countryId = countryId;
    if (officeId) where.officeId = officeId;
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
          countryId: true,
          cityId: true,
          balanceBlack: true,
          balanceWhite: true,
          balanceRed: true,
          balanceBlue: true,
          balanceVersion: true,
          country: { select: { id: true, name: true, code: true } },
          city: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
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
        country: u.country,
        city: u.city,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** POST /balances/adjust — manual correction. ADMIN/OFFICE only. */
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
      if (user.role !== Role.CITY && user.role !== Role.COUNTRY) {
        throw new BadRequestException(
          'Only CITY/COUNTRY users have personal balances',
        );
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

      this.logger.log(
        `Balance adjusted: user ${userId} ${color} ${delta > 0 ? '+' : ''}${delta} (${before} → ${after}) by ${actorId}`,
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
   * GET /balances/users/:userId/history — timeline of audit events
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

    // Events touching this user:
    //  • BALANCE_ADJUSTED on entity=User/userId
    //  • EXPENSE_CREATED / EXPENSE_DELETED with metadata.userId === userId
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        {
          action: 'BALANCE_ADJUSTED',
          entityType: 'User',
          entityId: targetUserId,
        },
        {
          action: { in: ['EXPENSE_CREATED', 'EXPENSE_DELETED'] },
          metadata: { path: ['userId'], equals: targetUserId },
        },
        {
          // Phase 7: transfer events (single audit row per transfer with affectedUserIds[])
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

  // ──────────────────────────────────────────────
  // SYNC HOOK (called from inventory.service)
  // ──────────────────────────────────────────────

  /**
   * Mirror Inventory(CITY|COUNTRY, scopeId).quantity into User.balance_* for
   * every active UserAccess targeting that scope. ADMIN/OFFICE skipped.
   * Idempotent — safe to call after every inventory write.
   *
   * Acceptable to skip silently on errors; caller stays in its own tx.
   */
  async syncFromInventory(
    tx: Prisma.TransactionClient,
    entityType: EntityType,
    entityId: string,
  ) {
    if (entityType !== EntityType.CITY && entityType !== EntityType.COUNTRY) {
      return;
    }
    const scopeType: ScopeType =
      entityType === EntityType.CITY ? ScopeType.CITY : ScopeType.COUNTRY;

    // Read current inventory for this scope.
    const where =
      entityType === EntityType.CITY
        ? { entityType: EntityType.CITY, cityId: entityId }
        : { entityType: EntityType.COUNTRY, countryId: entityId };

    const items = await tx.inventory.findMany({ where });
    const totals: Record<ItemType, number> = {
      BLACK: 0,
      WHITE: 0,
      RED: 0,
      BLUE: 0,
    } as any;
    for (const it of items) {
      totals[it.itemType] = it.quantity;
    }

    // Find active accesses for that scope.
    const now = new Date();
    const accesses = await tx.userAccess.findMany({
      where: {
        scopeType,
        scopeId: entityId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { userId: true },
    });
    if (accesses.length === 0) return;

    const userIds = Array.from(new Set(accesses.map((a) => a.userId)));

    await tx.user.updateMany({
      where: {
        id: { in: userIds },
        role: { in: [Role.CITY, Role.COUNTRY] },
      },
      data: {
        balanceBlack: totals.BLACK,
        balanceWhite: totals.WHITE,
        balanceRed: totals.RED,
        balanceBlue: totals.BLUE,
        balanceVersion: { increment: 1 },
      },
    });
  }
}
