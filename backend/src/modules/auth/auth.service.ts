import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuditAction, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser, JwtPayload } from '../../common/auth/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    return this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me';
  }

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { accesses: { include: { country: true, city: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('INVALID_CREDENTIALS');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('INVALID_CREDENTIALS');

    const personalToken = await this.jwt.signAsync(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        kind: 'personal',
      } as JwtPayload,
      { secret: this.secret(), expiresIn: '15m' },
    );

    const accesses = user.accesses.map((a) => ({
      id: a.id,
      scope: a.scope,
      countryId: a.countryId,
      cityId: a.cityId,
      countryName: a.country?.name ?? null,
      countryCode: a.country?.code ?? null,
      cityName: a.city?.name ?? null,
      cityCode: a.city?.code ?? null,
    }));

    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.AUTH_LOGIN,
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        payload: { username },
      },
    });

    return {
      personalAccessToken: personalToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      accesses,
    };
  }

  async myAccesses(userId: string) {
    const accesses = await this.prisma.userAccess.findMany({
      where: { userId },
      include: { country: true, city: true },
    });
    return {
      accesses: accesses.map((a) => ({
        id: a.id,
        scope: a.scope,
        countryId: a.countryId,
        cityId: a.cityId,
        countryName: a.country?.name ?? null,
        countryCode: a.country?.code ?? null,
        cityName: a.city?.name ?? null,
        cityCode: a.city?.code ?? null,
      })),
    };
  }

  async selectScope(authUser: AuthUser, accessId: string) {
    const access = await this.prisma.userAccess.findUnique({
      where: { id: accessId },
      include: { country: true, city: true },
    });
    if (!access) throw new NotFoundException('ACCESS_NOT_FOUND');
    if (access.userId !== authUser.id) throw new ForbiddenException('NOT_YOUR_ACCESS');

    await this.prisma.user.update({
      where: { id: authUser.id },
      data: { lastLoginAt: new Date() },
    });

    const sessionToken = await this.jwt.signAsync(
      {
        sub: authUser.id,
        username: authUser.username,
        role: authUser.role,
        kind: 'session',
        accessId: access.id,
        scope: {
          scope: access.scope,
          countryId: access.countryId,
          cityId: access.cityId,
        },
      } as JwtPayload,
      { secret: this.secret(), expiresIn: '7d' },
    );

    return {
      sessionToken,
      currentAccess: {
        id: access.id,
        scope: access.scope,
        countryId: access.countryId,
        cityId: access.cityId,
        countryName: access.country?.name ?? null,
        cityName: access.city?.name ?? null,
      },
    };
  }

  async changePassword(authUser: AuthUser, oldPassword: string, newPassword: string) {
    if (authUser.role === Role.COUNTRY) {
      throw new ForbiddenException('COUNTRY_CANNOT_SELF_RESET');
    }
    const user = await this.prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new ConflictException('WRONG_OLD_PASSWORD');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { ok: true };
  }

  async me(authUser: AuthUser) {
    const fresh = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        accesses: {
          include: { country: true, city: true },
        },
      },
    });
    if (!fresh) throw new NotFoundException('USER_NOT_FOUND');
    let currentAccess = null;
    if (authUser.accessId) {
      const a = fresh.accesses.find((x) => x.id === authUser.accessId);
      if (a) {
        currentAccess = {
          id: a.id,
          scope: a.scope,
          countryId: a.countryId,
          cityId: a.cityId,
          countryName: a.country?.name ?? null,
          cityName: a.city?.name ?? null,
        };
      }
    }
    return {
      user: {
        id: fresh.id,
        username: fresh.username,
        displayName: fresh.displayName,
        role: fresh.role,
        isActive: fresh.isActive,
      },
      currentAccess,
      accesses: fresh.accesses.map((a) => ({
        id: a.id,
        scope: a.scope,
        countryId: a.countryId,
        cityId: a.cityId,
        countryName: a.country?.name ?? null,
        cityName: a.city?.name ?? null,
      })),
    };
  }
}
