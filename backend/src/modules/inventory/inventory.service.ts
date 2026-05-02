import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, BraceletColor } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { visibleCityIds } from '../../common/auth/scope.util';
import { IntakeDto } from './dto/intake.dto';

const COLORS: BraceletColor[] = [
  BraceletColor.BLACK,
  BraceletColor.WHITE,
  BraceletColor.RED,
  BraceletColor.BLUE,
];

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async byCity(user: AuthUser) {
    const allowed = await visibleCityIds(this.prisma, user);
    const cities = await this.prisma.city.findMany({
      where: allowed === null ? { isActive: true } : { isActive: true, id: { in: allowed } },
      include: { country: true, inventory: true },
      orderBy: [{ country: { name: 'asc' } }, { name: 'asc' }],
    });
    return cities.map((c) => {
      const balances: Record<string, number> = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
      for (const inv of c.inventory) balances[inv.color] = inv.count;
      const total = Object.values(balances).reduce((s, n) => s + n, 0);
      return {
        cityId: c.id,
        cityCode: c.code,
        cityName: c.name,
        countryId: c.countryId,
        countryCode: c.country.code,
        countryName: c.country.name,
        balances,
        total,
      };
    });
  }

  async byCountry(user: AuthUser) {
    const cities = await this.byCity(user);
    const map = new Map<
      string,
      {
        countryId: string;
        countryCode: string;
        countryName: string;
        balances: Record<string, number>;
        total: number;
      }
    >();
    for (const c of cities) {
      const cur = map.get(c.countryId) ?? {
        countryId: c.countryId,
        countryCode: c.countryCode,
        countryName: c.countryName,
        balances: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 },
        total: 0,
      };
      for (const k of COLORS) cur.balances[k] += c.balances[k];
      cur.total += c.total;
      map.set(c.countryId, cur);
    }
    return [...map.values()];
  }

  async intake(dto: IntakeDto, actor: AuthUser) {
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!city) throw new NotFoundException('CITY_NOT_FOUND');
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.upsert({
        where: { cityId_color: { cityId: dto.cityId, color: dto.color } },
        create: { cityId: dto.cityId, color: dto.color, count: dto.count },
        update: { count: { increment: dto.count } },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.INVENTORY_INTAKE,
          userId: actor.id,
          entityType: 'Inventory',
          entityId: inv.id,
          payload: {
            cityId: dto.cityId,
            cityName: city.name,
            countryId: city.countryId,
            color: dto.color,
            count: dto.count,
            note: dto.note ?? null,
          },
        },
      });
      return { ok: true, cityId: dto.cityId, color: dto.color, newBalance: inv.count };
    });
  }

  async stats(user: AuthUser) {
    const sc = user.scope;
    const isGlobal = !sc || sc.scope === 'GLOBAL';
    const isCountry = sc?.scope === 'COUNTRY';
    const isCity = sc?.scope === 'CITY';

    const scopedTransferWhere = isGlobal ? {} : {
      ...(isCountry && sc.countryId ? { fromCountryId: sc.countryId } : {}),
      ...(isCity && sc.cityId ? { fromCityId: sc.cityId } : {}),
    };
    const scopedExpenseWhere = isGlobal ? {} : {
      ...(isCountry && sc.countryId ? { countryId: sc.countryId } : {}),
      ...(isCity && sc.cityId ? { cityId: sc.cityId } : {}),
    };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [cities, pendingTransfers, discrepancies, expenses] = await Promise.all([
      this.byCity(user),
      this.prisma.transfer.count({ where: { status: 'PENDING', ...scopedTransferWhere } }),
      this.prisma.transfer.count({ where: { status: 'DISCREPANCY', ...scopedTransferWhere } }),
      this.prisma.expense.count({ where: { createdAt: { gte: monthStart }, ...scopedExpenseWhere } }),
    ]);
    const totalBracelets = cities.reduce((s, c) => s + c.total, 0);
    const totalCities = cities.length;
    return { totalBracelets, totalCities, pendingTransfers, discrepancies, expensesThisMonth: expenses };
  }
}
