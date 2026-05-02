import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ExpenseKind,
  Role,
  TransferStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { canAccessCity, requireCityAccess, visibleCityIds } from '../../common/auth/scope.util';
import { generateTransferCode } from '../../common/util/transfer-code';
import {
  AcceptTransferDto,
  CreateTransferDto,
  TransferListQueryDto,
} from './dto/transfers.dto';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadFull(id: string) {
    const t = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        lines: true,
        fromCity: { include: { country: true } },
        toCity: { include: { country: true } },
        createdBy: { select: { id: true, username: true, displayName: true, role: true } },
        acceptedBy: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });
    if (!t) throw new NotFoundException('TRANSFER_NOT_FOUND');
    return t;
  }

  async list(user: AuthUser, q: TransferListQueryDto) {
    const allowedCities = await visibleCityIds(this.prisma, user);
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.fromCityId) where.fromCityId = q.fromCityId;
    if (q.toCityId) where.toCityId = q.toCityId;
    if (allowedCities !== null) {
      where.OR = [
        { fromCityId: { in: allowedCities } },
        { toCityId: { in: allowedCities } },
      ];
    }
    const items = await this.prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        lines: true,
        fromCity: { include: { country: true } },
        toCity: { include: { country: true } },
        createdBy: { select: { id: true, username: true, displayName: true } },
        acceptedBy: { select: { id: true, username: true, displayName: true } },
      },
    });
    return items;
  }

  async byId(user: AuthUser, id: string) {
    const t = await this.loadFull(id);
    const fromOk = await canAccessCity(this.prisma, user, t.fromCityId);
    const toOk = await canAccessCity(this.prisma, user, t.toCityId);
    if (!fromOk && !toOk) throw new ForbiddenException('NO_TRANSFER_ACCESS');
    return t;
  }

  async create(dto: CreateTransferDto, actor: AuthUser) {
    if (dto.fromCityId === dto.toCityId)
      throw new BadRequestException('FROM_AND_TO_MUST_DIFFER');
    await requireCityAccess(this.prisma, actor, dto.fromCityId);

    const fromCity = await this.prisma.city.findUnique({ where: { id: dto.fromCityId } });
    const toCity = await this.prisma.city.findUnique({ where: { id: dto.toCityId } });
    if (!fromCity || !toCity) throw new NotFoundException('CITY_NOT_FOUND');

    // dedupe colors
    const seen = new Set<string>();
    for (const l of dto.lines) {
      if (seen.has(l.color)) throw new BadRequestException('DUPLICATE_COLOR_IN_LINES');
      seen.add(l.color);
    }

    return this.prisma.$transaction(async (tx) => {
      // decrement sender balances atomically
      for (const l of dto.lines) {
        const inv = await tx.inventory.findUnique({
          where: { cityId_color: { cityId: dto.fromCityId, color: l.color } },
        });
        const current = inv?.count ?? 0;
        if (current < l.sentCount) {
          throw new ConflictException(
            `INSUFFICIENT_BALANCE:${l.color}:have=${current}:need=${l.sentCount}`,
          );
        }
        await tx.inventory.upsert({
          where: { cityId_color: { cityId: dto.fromCityId, color: l.color } },
          create: { cityId: dto.fromCityId, color: l.color, count: -l.sentCount },
          update: { count: { decrement: l.sentCount } },
        });
      }

      // create transfer + lines
      let code = generateTransferCode();
      for (let i = 0; i < 5; i++) {
        const dup = await tx.transfer.findUnique({ where: { code } });
        if (!dup) break;
        code = generateTransferCode();
      }
      const transfer = await tx.transfer.create({
        data: {
          code,
          fromCityId: dto.fromCityId,
          toCityId: dto.toCityId,
          status: TransferStatus.PENDING,
          comment: dto.comment ?? null,
          createdById: actor.id,
          lines: {
            create: dto.lines.map((l) => ({ color: l.color, sentCount: l.sentCount })),
          },
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.TRANSFER_CREATED,
          userId: actor.id,
          entityType: 'Transfer',
          entityId: transfer.id,
          payload: {
            code: transfer.code,
            fromCityId: dto.fromCityId,
            fromCityName: fromCity.name,
            fromCountryId: fromCity.countryId,
            toCityId: dto.toCityId,
            toCityName: toCity.name,
            toCountryId: toCity.countryId,
            lines: dto.lines as object,
          },
        },
      });

      return transfer;
    });
  }

  async accept(id: string, dto: AcceptTransferDto, actor: AuthUser) {
    const t = await this.loadFull(id);
    if (t.status !== TransferStatus.PENDING)
      throw new ConflictException(`TRANSFER_NOT_PENDING:${t.status}`);
    await requireCityAccess(this.prisma, actor, t.toCityId);

    const sentByColor = new Map(t.lines.map((l) => [l.color, l.sentCount]));
    let hasShortage = false;
    for (const r of dto.lines) {
      const sent = sentByColor.get(r.color);
      if (sent === undefined) throw new BadRequestException(`UNKNOWN_COLOR:${r.color}`);
      if (r.receivedCount > sent) throw new BadRequestException(`RECEIVED_GT_SENT:${r.color}`);
      if (r.receivedCount < sent) hasShortage = true;
    }
    if (dto.lines.length !== t.lines.length) {
      throw new BadRequestException('LINE_COUNT_MISMATCH');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const r of dto.lines) {
        await tx.transferLine.update({
          where: { transferId_color: { transferId: t.id, color: r.color } },
          data: { receivedCount: r.receivedCount },
        });
      }

      if (!hasShortage) {
        // ACCEPTED: credit receiver in full
        for (const l of t.lines) {
          await tx.inventory.upsert({
            where: { cityId_color: { cityId: t.toCityId, color: l.color } },
            create: { cityId: t.toCityId, color: l.color, count: l.sentCount },
            update: { count: { increment: l.sentCount } },
          });
        }
        await tx.transfer.update({
          where: { id: t.id },
          data: {
            status: TransferStatus.ACCEPTED,
            acceptedById: actor.id,
            acceptedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            action: AuditAction.TRANSFER_ACCEPTED,
            userId: actor.id,
            entityType: 'Transfer',
            entityId: t.id,
            payload: {
              code: t.code,
              fromCityId: t.fromCityId,
              toCityId: t.toCityId,
              lines: dto.lines as object,
            },
          },
        });
      } else {
        // DISCREPANCY: do not move balances yet, wait for /resolve
        await tx.transfer.update({
          where: { id: t.id },
          data: {
            status: TransferStatus.DISCREPANCY,
            acceptedById: actor.id,
            acceptedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            action: AuditAction.TRANSFER_DISCREPANCY,
            userId: actor.id,
            entityType: 'Transfer',
            entityId: t.id,
            payload: {
              code: t.code,
              fromCityId: t.fromCityId,
              toCityId: t.toCityId,
              lines: dto.lines as object,
            },
          },
        });
      }
      return tx.transfer.findUnique({ where: { id: t.id }, include: { lines: true } });
    });
  }

  async resolve(id: string, actor: AuthUser) {
    const t = await this.loadFull(id);
    if (t.status !== TransferStatus.DISCREPANCY)
      throw new ConflictException(`NOT_DISCREPANCY:${t.status}`);
    await requireCityAccess(this.prisma, actor, t.toCityId);

    return this.prisma.$transaction(async (tx) => {
      for (const l of t.lines) {
        const received = l.receivedCount ?? 0;
        if (received > 0) {
          await tx.inventory.upsert({
            where: { cityId_color: { cityId: t.toCityId, color: l.color } },
            create: { cityId: t.toCityId, color: l.color, count: received },
            update: { count: { increment: received } },
          });
        }
        const shortage = l.sentCount - received;
        if (shortage > 0) {
          const exp = await tx.expense.create({
            data: {
              cityId: t.fromCityId,
              color: l.color,
              count: shortage,
              kind: ExpenseKind.SHORTAGE,
              reason: `Transfer ${t.code} discrepancy`,
              createdById: actor.id,
              transferId: t.id,
            },
          });
          await tx.auditLog.create({
            data: {
              action: AuditAction.EXPENSE_CREATED,
              userId: actor.id,
              entityType: 'Expense',
              entityId: exp.id,
              payload: {
                cityId: t.fromCityId,
                countryId: t.fromCity.countryId,
                color: l.color,
                count: shortage,
                kind: ExpenseKind.SHORTAGE,
                transferId: t.id,
                transferCode: t.code,
              },
            },
          });
        }
      }
      await tx.transfer.update({
        where: { id: t.id },
        data: { status: TransferStatus.RESOLVED, resolvedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.TRANSFER_RESOLVED,
          userId: actor.id,
          entityType: 'Transfer',
          entityId: t.id,
          payload: {
            code: t.code,
            fromCityId: t.fromCityId,
            toCityId: t.toCityId,
          },
        },
      });
      return tx.transfer.findUnique({ where: { id: t.id }, include: { lines: true } });
    });
  }

  async reject(id: string, actor: AuthUser) {
    const t = await this.loadFull(id);
    if (t.status !== TransferStatus.PENDING)
      throw new ConflictException(`NOT_PENDING:${t.status}`);
    await requireCityAccess(this.prisma, actor, t.toCityId);
    return this.prisma.$transaction(async (tx) => {
      for (const l of t.lines) {
        await tx.inventory.upsert({
          where: { cityId_color: { cityId: t.fromCityId, color: l.color } },
          create: { cityId: t.fromCityId, color: l.color, count: l.sentCount },
          update: { count: { increment: l.sentCount } },
        });
      }
      await tx.transfer.update({
        where: { id: t.id },
        data: { status: TransferStatus.REJECTED, acceptedById: actor.id, acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.TRANSFER_REJECTED,
          userId: actor.id,
          entityType: 'Transfer',
          entityId: t.id,
          payload: { code: t.code, fromCityId: t.fromCityId, toCityId: t.toCityId },
        },
      });
      return tx.transfer.findUnique({ where: { id: t.id }, include: { lines: true } });
    });
  }

  async cancel(id: string, actor: AuthUser) {
    const t = await this.loadFull(id);
    if (t.status !== TransferStatus.PENDING)
      throw new ConflictException(`NOT_PENDING:${t.status}`);
    const isPrivileged = actor.role === Role.ADMIN || actor.role === Role.OFFICE;
    if (!isPrivileged && t.createdById !== actor.id) {
      throw new ForbiddenException('NOT_OWNER');
    }
    return this.prisma.$transaction(async (tx) => {
      for (const l of t.lines) {
        await tx.inventory.upsert({
          where: { cityId_color: { cityId: t.fromCityId, color: l.color } },
          create: { cityId: t.fromCityId, color: l.color, count: l.sentCount },
          update: { count: { increment: l.sentCount } },
        });
      }
      await tx.transfer.update({
        where: { id: t.id },
        data: { status: TransferStatus.CANCELLED },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.TRANSFER_CANCELLED,
          userId: actor.id,
          entityType: 'Transfer',
          entityId: t.id,
          payload: { code: t.code, fromCityId: t.fromCityId, toCityId: t.toCityId },
        },
      });
      return tx.transfer.findUnique({ where: { id: t.id }, include: { lines: true } });
    });
  }
}
