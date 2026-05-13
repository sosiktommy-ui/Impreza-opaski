import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccessType, ScopeType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GrantAccessDto } from './dto/grant-access.dto';
import { UpdateAccessDto } from './dto/update-access.dto';

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** List all access entries for a user (including revoked, for audit). */
  async listForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const accesses = await this.prisma.userAccess.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      include: {
        grantedBy: { select: { id: true, username: true, displayName: true } },
      },
    });

    // Resolve target names for scoped accesses (polymorphic scopeId)
    const cityIds = accesses.filter(a => a.scopeType === 'CITY' && a.scopeId).map(a => a.scopeId as string);
    const countryIds = accesses.filter(a => a.scopeType === ('COUNTRY' as any) && a.scopeId).map(a => a.scopeId as string);

    const [cities, countries] = await Promise.all([
      cityIds.length > 0
        ? this.prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      countryIds.length > 0
        ? this.prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const cityMap = Object.fromEntries(cities.map(c => [c.id, c.name]));
    const countryMap = Object.fromEntries(countries.map(c => [c.id, c.name]));

    return accesses.map(a => ({
      ...a,
      target: a.scopeId
        ? { id: a.scopeId, name: cityMap[a.scopeId] || countryMap[a.scopeId] || a.scopeId }
        : null,
    }));
  }

  async grant(dto: GrantAccessDto, granterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.validateScope(dto.scopeType, dto.scopeId ?? null);
    this.validateAccessType(dto.scopeType, dto.accessType ?? AccessType.FULL);

    // Avoid duplicate active access for the same scope
    const existing = await this.prisma.userAccess.findFirst({
      where: {
        userId: dto.userId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId ?? null,
        revokedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException('User already has active access for this scope');
    }

    const created = await this.prisma.userAccess.create({
      data: {
        userId: dto.userId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId ?? null,
        accessType: dto.accessType ?? AccessType.FULL,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        notes: dto.notes ?? null,
        grantedById: granterId,
      },
    });

    this.eventEmitter.emit('access.granted', {
      actorId: granterId,
      accessId: created.id,
      userId: dto.userId,
      scopeType: dto.scopeType,
      accessType: created.accessType,
      scopeId: dto.scopeId ?? null,
      expiresAt: created.expiresAt,
      notes: created.notes,
    });

    return created;
  }

  async revoke(accessId: string, actorId: string) {
    const access = await this.prisma.userAccess.findUnique({ where: { id: accessId } });
    if (!access) throw new NotFoundException('Access not found');
    if (access.revokedAt) {
      throw new BadRequestException('Access already revoked');
    }
    const updated = await this.prisma.userAccess.update({
      where: { id: accessId },
      data: { revokedAt: new Date() },
    });
    this.eventEmitter.emit('access.revoked', {
      actorId,
      accessId,
      userId: access.userId,
      scopeType: access.scopeType,
      scopeId: access.scopeId,
    });
    return updated;
  }

  async update(accessId: string, dto: UpdateAccessDto) {
    const access = await this.prisma.userAccess.findUnique({ where: { id: accessId } });
    if (!access) throw new NotFoundException('Access not found');

    const nextAccessType = dto.accessType ?? access.accessType;
    this.validateAccessType(access.scopeType, nextAccessType);

    const data: {
      accessType?: AccessType;
      expiresAt?: Date | null;
      notes?: string | null;
    } = {};
    if (dto.accessType !== undefined) {
      data.accessType = dto.accessType;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    return this.prisma.userAccess.update({
      where: { id: accessId },
      data,
    });
  }

  private validateAccessType(scopeType: ScopeType, accessType: AccessType): void {
    if (
      accessType === AccessType.PARTIAL &&
      (scopeType === ScopeType.GLOBAL || scopeType === ScopeType.OFFICE)
    ) {
      throw new BadRequestException('PARTIAL access is allowed only for CITY scope');
    }
  }

  /** Validate that scopeId references a real entity for the given scopeType. */
  private async validateScope(
    scopeType: ScopeType,
    scopeId: string | null,
  ): Promise<void> {
    if (scopeType === ScopeType.GLOBAL) {
      if (scopeId) throw new BadRequestException('GLOBAL scope must have null scopeId');
      return;
    }
    if (!scopeId) {
      throw new BadRequestException(`scopeId is required for ${scopeType}`);
    }
    if (scopeType === ScopeType.OFFICE) {
      const office = await this.prisma.office.findUnique({ where: { id: scopeId } });
      if (!office) throw new BadRequestException('Office not found');
    } else if ((scopeType as string) === 'COUNTRY') {
      const country = await this.prisma.country.findUnique({ where: { id: scopeId } });
      if (!country) throw new BadRequestException('Country not found');
    } else if (scopeType === ScopeType.CITY) {
      const city = await this.prisma.city.findUnique({ where: { id: scopeId } });
      if (!city) throw new BadRequestException('City not found');
    }
  }
}
