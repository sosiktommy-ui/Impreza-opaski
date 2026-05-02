import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessScope, AuditAction, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import {
  AccessDto,
  CreateUserDto,
  ReplaceAccessesDto,
  UpdateUserDto,
} from './dto/users.dto';

function validateAccessesForRole(role: Role, accesses: AccessDto[]) {
  if (accesses.length === 0) throw new BadRequestException('NO_ACCESSES');

  if (role === Role.ADMIN || role === Role.OFFICE) {
    if (accesses.length !== 1 || accesses[0].scope !== AccessScope.GLOBAL) {
      throw new BadRequestException('ADMIN_OFFICE_REQUIRES_GLOBAL');
    }
  }
  if (role === Role.COUNTRY) {
    for (const a of accesses) {
      if (a.scope !== AccessScope.COUNTRY || !a.countryId) {
        throw new BadRequestException('COUNTRY_REQUIRES_COUNTRY_SCOPE');
      }
    }
  }
  if (role === Role.MANAGER) {
    for (const a of accesses) {
      if (a.scope !== AccessScope.CITY || !a.cityId) {
        throw new BadRequestException('MANAGER_REQUIRES_CITY_SCOPE');
      }
    }
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({
      include: { accesses: { include: { country: true, city: true } } },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      accesses: u.accesses.map((a) => ({
        id: a.id,
        scope: a.scope,
        countryId: a.countryId,
        cityId: a.cityId,
        countryName: a.country?.name ?? null,
        cityName: a.city?.name ?? null,
      })),
    }));
  }

  async findById(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { accesses: { include: { country: true, city: true } } },
    });
    if (!u) throw new NotFoundException('USER_NOT_FOUND');
    return u;
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    validateAccessesForRole(dto.role, dto.accesses);
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException('USERNAME_TAKEN');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: dto.username,
          displayName: dto.displayName,
          passwordHash,
          role: dto.role,
          accesses: {
            create: dto.accesses.map((a) => ({
              scope: a.scope,
              countryId: a.countryId ?? null,
              cityId: a.cityId ?? null,
            })),
          },
        },
        include: { accesses: true },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.USER_CREATED,
          userId: actor.id,
          entityType: 'User',
          entityId: created.id,
          payload: { username: dto.username, role: dto.role, accesses: dto.accesses as object },
        },
      });
      return created;
    });
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const target = await this.findById(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          displayName: dto.displayName ?? undefined,
          isActive: dto.isActive ?? undefined,
          role: dto.role ?? undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.USER_UPDATED,
          userId: actor.id,
          entityType: 'User',
          entityId: id,
          payload: { before: { displayName: target.displayName, isActive: target.isActive, role: target.role }, after: dto as object },
        },
      });
      return updated;
    });
  }

  async softDelete(id: string, actor: AuthUser) {
    if (id === actor.id) throw new BadRequestException('CANNOT_DELETE_SELF');
    await this.findById(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false } });
      await tx.auditLog.create({
        data: {
          action: AuditAction.USER_DELETED,
          userId: actor.id,
          entityType: 'User',
          entityId: id,
          payload: {},
        },
      });
      return { ok: true };
    });
  }

  async resetPassword(id: string, newPassword: string, actor: AuthUser) {
    await this.findById(id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.auditLog.create({
        data: {
          action: AuditAction.USER_UPDATED,
          userId: actor.id,
          entityType: 'User',
          entityId: id,
          payload: { passwordReset: true },
        },
      });
      return { ok: true };
    });
  }

  async replaceAccesses(id: string, dto: ReplaceAccessesDto, actor: AuthUser) {
    const target = await this.findById(id);
    validateAccessesForRole(target.role, dto.accesses);
    return this.prisma.$transaction(async (tx) => {
      const oldAccesses = await tx.userAccess.findMany({ where: { userId: id } });
      await tx.userAccess.deleteMany({ where: { userId: id } });
      const created = [];
      for (const a of dto.accesses) {
        created.push(
          await tx.userAccess.create({
            data: {
              userId: id,
              scope: a.scope,
              countryId: a.countryId ?? null,
              cityId: a.cityId ?? null,
            },
          }),
        );
      }
      await tx.auditLog.create({
        data: {
          action: AuditAction.ACCESS_REVOKED,
          userId: actor.id,
          entityType: 'User',
          entityId: id,
          payload: { revoked: oldAccesses.length },
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.ACCESS_GRANTED,
          userId: actor.id,
          entityType: 'User',
          entityId: id,
          payload: { granted: dto.accesses as object },
        },
      });
      return created;
    });
  }
}
