import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, ExpenseKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { requireCityAccess, visibleCityIds } from '../../common/auth/scope.util';
import { CreateExpenseDto, ExpenseListQueryDto } from './dto/expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, q: ExpenseListQueryDto) {
    const allowed = await visibleCityIds(this.prisma, user);
    const where: any = {};
    if (q.cityId) where.cityId = q.cityId;
    if (q.kind) where.kind = q.kind;
    if (q.color) where.color = q.color;
    if (allowed !== null) where.cityId = { in: allowed };
    return this.prisma.expense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        city: { include: { country: true } },
        createdBy: { select: { id: true, username: true, displayName: true } },
        transfer: { select: { id: true, code: true } },
      },
    });
  }

  async create(dto: CreateExpenseDto, actor: AuthUser) {
    if (dto.kind === ExpenseKind.SHORTAGE) {
      throw new BadRequestException('SHORTAGE_IS_SYSTEM_ONLY');
    }
    await requireCityAccess(this.prisma, actor, dto.cityId);
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!city) throw new NotFoundException('CITY_NOT_FOUND');

    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { cityId_color: { cityId: dto.cityId, color: dto.color } },
      });
      const current = inv?.count ?? 0;
      if (current < dto.count) {
        throw new ConflictException(
          `INSUFFICIENT_BALANCE:${dto.color}:have=${current}:need=${dto.count}`,
        );
      }
      await tx.inventory.update({
        where: { cityId_color: { cityId: dto.cityId, color: dto.color } },
        data: { count: { decrement: dto.count } },
      });
      const exp = await tx.expense.create({
        data: {
          cityId: dto.cityId,
          color: dto.color,
          count: dto.count,
          kind: dto.kind,
          reason: dto.reason ?? null,
          createdById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.EXPENSE_CREATED,
          userId: actor.id,
          entityType: 'Expense',
          entityId: exp.id,
          payload: {
            cityId: dto.cityId,
            cityName: city.name,
            countryId: city.countryId,
            color: dto.color,
            count: dto.count,
            kind: dto.kind,
            reason: dto.reason ?? null,
          },
        },
      });
      return exp;
    });
  }

  async remove(id: string, actor: AuthUser) {
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw new NotFoundException('EXPENSE_NOT_FOUND');
    return this.prisma.$transaction(async (tx) => {
      await tx.inventory.upsert({
        where: { cityId_color: { cityId: exp.cityId, color: exp.color } },
        create: { cityId: exp.cityId, color: exp.color, count: exp.count },
        update: { count: { increment: exp.count } },
      });
      await tx.expense.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: AuditAction.EXPENSE_DELETED,
          userId: actor.id,
          entityType: 'Expense',
          entityId: id,
          payload: {
            cityId: exp.cityId,
            color: exp.color,
            count: exp.count,
            kind: exp.kind,
          },
        },
      });
      return { ok: true };
    });
  }
}
