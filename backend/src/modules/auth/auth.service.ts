import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, ScopeType, UserAccess } from '@prisma/client';

/** Token kinds. Personal token is short-lived and only allows scope selection. */
export type JwtKind = 'personal' | 'scoped';

/**
 * Backwards-compatible JWT payload.
 * - Legacy fields (officeId/countryId/cityId/role) remain populated for scoped tokens
 *   so existing guards/services continue to work without changes.
 * - New fields (kind/scopeType/scopeId/accessId) drive the two-step flow.
 */
export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  officeId: string | null;
  countryId: string | null;
  cityId: string | null;
  kind?: JwtKind;
  scopeType?: ScopeType;
  scopeId?: string | null;
  accessId?: string;
}

export interface ResolvedScopeFields {
  officeId: string | null;
  countryId: string | null;
  cityId: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  displayName: string;
  avatarUrl?: string | null;
  officeId: string | null;
  countryId: string | null;
  cityId: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    // Try by username first, then by email
    let user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user && username.includes('@')) {
      user = await this.prisma.user.findFirst({
        where: { email: username },
      });
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.loginDisabled) {
      throw new UnauthorizedException('Login disabled for this account');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Save plaintext password for admin visibility
    if (user.passwordVisible !== password) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordVisible: password },
      }).catch(() => {});
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      officeId: user.officeId,
      countryId: user.countryId,
      cityId: user.cityId,
    };
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await this.validateUser(username, password);

    // Backwards compatibility: pick a default access for this user and issue
    // a scoped token. Existing frontend keeps working unchanged.
    const access = await this.pickDefaultAccess(user);
    const tokens = await this.generateScopedTokens(user, access);

    this.logger.log(
      `User ${user.username} (${user.role}) logged in [scope=${access.scopeType}/${access.scopeId ?? 'null'}]`,
    );

    return { user, tokens };
  }

  /**
   * Issue a personal (kind='personal') access token after username/password.
   * Used by the new two-step login flow. No refresh token, 15-min lifetime.
   */
  async loginPersonal(username: string, password: string): Promise<{
    user: AuthenticatedUser;
    personalAccessToken: string;
  }> {
    const user = await this.validateUser(username, password);
    const personalAccessToken = this.generatePersonalToken(user);
    this.logger.log(`User ${user.username} acquired personal token`);
    return { user, personalAccessToken };
  }

  /**
   * Build the legacy {officeId, countryId, cityId} triplet from a UserAccess.
   * - GLOBAL  -> all null (admin)
   * - OFFICE  -> officeId only
   * - COUNTRY -> countryId + officeId (resolved via Country.officeId)
   * - CITY    -> cityId + countryId + officeId (resolved via City -> Country)
   */
  async resolveScopeFields(access: UserAccess): Promise<ResolvedScopeFields> {
    if (access.scopeType === ScopeType.GLOBAL) {
      return { officeId: null, countryId: null, cityId: null };
    }
    if (!access.scopeId) {
      throw new Error(`UserAccess ${access.id} has scopeType=${access.scopeType} but scopeId is null`);
    }
    if (access.scopeType === ScopeType.OFFICE) {
      return { officeId: access.scopeId, countryId: null, cityId: null };
    }
    if (access.scopeType === ScopeType.COUNTRY) {
      const country = await this.prisma.country.findUnique({
        where: { id: access.scopeId },
        select: { id: true, officeId: true },
      });
      if (!country) throw new UnauthorizedException('Country no longer exists');
      return { officeId: country.officeId ?? null, countryId: country.id, cityId: null };
    }
    if (access.scopeType === ScopeType.CITY) {
      const city = await this.prisma.city.findUnique({
        where: { id: access.scopeId },
        select: { id: true, countryId: true, country: { select: { officeId: true } } },
      });
      if (!city) throw new UnauthorizedException('City no longer exists');
      return {
        officeId: city.country?.officeId ?? null,
        countryId: city.countryId,
        cityId: city.id,
      };
    }
    throw new Error(`Unknown scopeType ${access.scopeType}`);
  }

  /**
   * Validate that an access belongs to the user, is not revoked, not expired.
   * Throws UnauthorizedException otherwise.
   */
  async assertAccessUsable(accessId: string, userId: string): Promise<UserAccess> {
    const access = await this.prisma.userAccess.findUnique({ where: { id: accessId } });
    if (!access || access.userId !== userId) {
      throw new UnauthorizedException('Access not found');
    }
    if (access.revokedAt) {
      throw new UnauthorizedException('Access has been revoked');
    }
    if (access.expiresAt && access.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Access has expired');
    }
    return access;
  }

  /**
   * Pick a default access at login time for backwards compatibility.
   * Priority: GLOBAL > OFFICE > COUNTRY > CITY > first found.
   * If user has multiple, prefers one matching the legacy user.{office,country,city}Id.
   */
  private async pickDefaultAccess(user: AuthenticatedUser): Promise<UserAccess> {
    const accesses = await this.prisma.userAccess.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { grantedAt: 'asc' },
    });
    if (accesses.length === 0) {
      throw new UnauthorizedException('No active access for this user');
    }

    // Prefer access matching legacy user fields
    const legacyMatch = accesses.find((a) => {
      if (a.scopeType === ScopeType.OFFICE && a.scopeId === user.officeId) return true;
      if (a.scopeType === ScopeType.COUNTRY && a.scopeId === user.countryId) return true;
      if (a.scopeType === ScopeType.CITY && a.scopeId === user.cityId) return true;
      if (a.scopeType === ScopeType.GLOBAL && user.role === Role.ADMIN) return true;
      return false;
    });
    if (legacyMatch) return legacyMatch;

    const priority: ScopeType[] = [ScopeType.GLOBAL, ScopeType.OFFICE, ScopeType.COUNTRY, ScopeType.CITY];
    for (const t of priority) {
      const match = accesses.find((a) => a.scopeType === t);
      if (match) return match;
    }
    return accesses[0];
  }

  async refresh(refreshTokenValue: string, previousAccessId?: string | null): Promise<TokenPair> {
    // Find the refresh token
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshTokenValue },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      // Revoke expired token
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }
    if (storedToken.user.loginDisabled) {
      throw new UnauthorizedException('Login disabled for this account');
    }

    // Rotate: revoke old token and issue new pair
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const baseUser: AuthenticatedUser = {
      id: storedToken.user.id,
      username: storedToken.user.username,
      email: storedToken.user.email,
      role: storedToken.user.role,
      displayName: storedToken.user.displayName,
      avatarUrl: storedToken.user.avatarUrl,
      officeId: storedToken.user.officeId,
      countryId: storedToken.user.countryId,
      cityId: storedToken.user.cityId,
    };

    // If the previous access was bound to a specific scope and that scope is
    // still usable, keep using it; otherwise fall back to the default access.
    let access: UserAccess | null = null;
    if (previousAccessId) {
      const found = await this.prisma.userAccess.findUnique({ where: { id: previousAccessId } });
      if (
        found &&
        found.userId === baseUser.id &&
        !found.revokedAt &&
        (!found.expiresAt || found.expiresAt.getTime() > Date.now())
      ) {
        access = found;
      }
    }
    if (!access) {
      access = await this.pickDefaultAccess(baseUser);
    }

    return this.generateScopedTokens(baseUser, access);
  }

  async logout(refreshTokenValue: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshTokenValue, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Issue a personal token: short-lived, no scope, kind='personal'.
   * Cannot be used by business endpoints — only by /auth/select-scope.
   */
  generatePersonalToken(user: AuthenticatedUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      officeId: null,
      countryId: null,
      cityId: null,
      kind: 'personal',
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  /**
   * Issue a scoped token + refresh token. Resolves legacy fields from the access
   * so existing guards/services keep working.
   */
  async generateScopedTokens(
    user: AuthenticatedUser,
    access: UserAccess,
  ): Promise<TokenPair> {
    const resolved = await this.resolveScopeFields(access);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      officeId: resolved.officeId,
      countryId: resolved.countryId,
      cityId: resolved.cityId,
      kind: 'scoped',
      scopeType: access.scopeType,
      scopeId: access.scopeId,
      accessId: access.id,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshTokenValue = uuidv4();
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId: user.id,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }

  /** @deprecated kept for compatibility — forwards to generateScopedTokens via default access. */
  private async generateTokens(user: AuthenticatedUser): Promise<TokenPair> {
    const access = await this.pickDefaultAccess(user);
    return this.generateScopedTokens(user, access);
  }

  async getUserFromToken(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        office: { select: { id: true, name: true, code: true } },
        country: { select: { id: true, name: true, code: true } },
        city: { select: { id: true, name: true, slug: true, countryId: true } },
      },
    });

    if (!user || !user.isActive) return null;
    if (user.loginDisabled) return null;

    // For scoped tokens — verify the underlying access is still usable.
    if (payload.kind === 'scoped' && payload.accessId) {
      const access = await this.prisma.userAccess.findUnique({
        where: { id: payload.accessId },
      });
      if (!access || access.userId !== user.id) return null;
      if (access.revokedAt) return null;
      if (access.expiresAt && access.expiresAt.getTime() <= Date.now()) return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      officeId: payload.officeId ?? user.officeId,
      countryId: payload.countryId ?? user.countryId,
      cityId: payload.cityId ?? user.cityId,
      office: user.office || undefined,
      country: user.country || undefined,
      city: user.city || undefined,
    } as AuthenticatedUser & { office?: any; country?: any; city?: any };
  }

  /**
   * Verify password for 2FA confirmation (used in discrepancy resolution)
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      return false;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    return isPasswordValid;
  }

  /**
   * Step 2 of two-step login. Caller must already hold a personal token.
   * Issues a scoped token + refresh and emits an audit event.
   */
  async selectScope(userId: string, accessId: string): Promise<{
    user: AuthenticatedUser;
    tokens: TokenPair;
    access: UserAccess;
  }> {
    const access = await this.assertAccessUsable(accessId, userId);
    const userRow = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: { select: { id: true, name: true, code: true } },
        country: { select: { id: true, name: true, code: true } },
        city: { select: { id: true, name: true, slug: true, countryId: true } },
      },
    });
    if (!userRow || !userRow.isActive || userRow.loginDisabled) {
      throw new UnauthorizedException('User is not active');
    }

    const baseUser: AuthenticatedUser = {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      role: userRow.role,
      displayName: userRow.displayName,
      avatarUrl: userRow.avatarUrl,
      officeId: userRow.officeId,
      countryId: userRow.countryId,
      cityId: userRow.cityId,
    };

    await this.writeActiveScope(userId, access);
    const tokens = await this.generateScopedTokens(baseUser, access);

    this.eventEmitter.emit('auth.scope_selected', {
      actorId: userId,
      accessId: access.id,
      scopeType: access.scopeType,
      scopeId: access.scopeId,
    });

    return { user: baseUser, tokens, access };
  }

  /**
   * Switch active scope for an already-scoped user. New tokens are issued and
   * User.activeCityId / activeCountryId are updated.
   */
  async switchScope(userId: string, newAccessId: string, previousAccessId?: string | null) {
    const result = await this.selectScope(userId, newAccessId);
    this.eventEmitter.emit('auth.scope_switched', {
      actorId: userId,
      previousAccessId: previousAccessId ?? null,
      accessId: result.access.id,
      scopeType: result.access.scopeType,
      scopeId: result.access.scopeId,
    });
    return result;
  }

  /**
   * Update User.activeCityId / activeCountryId based on the chosen scope.
   * GLOBAL/OFFICE leave both null.
   */
  private async writeActiveScope(userId: string, access: UserAccess): Promise<void> {
    let activeCityId: string | null = null;
    let activeCountryId: string | null = null;

    if (access.scopeType === ScopeType.CITY && access.scopeId) {
      const city = await this.prisma.city.findUnique({
        where: { id: access.scopeId },
        select: { id: true, countryId: true },
      });
      if (city) {
        activeCityId = city.id;
        activeCountryId = city.countryId;
      }
    } else if (access.scopeType === ScopeType.COUNTRY && access.scopeId) {
      activeCountryId = access.scopeId;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { activeCityId, activeCountryId },
    });
  }

  /**
   * Return user's accesses with resolved scope names for the frontend picker.
   * Excludes revoked and expired entries.
   */
  async listMyAccesses(userId: string) {
    const accesses = await this.prisma.userAccess.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { grantedAt: 'asc' },
    });

    const officeIds = accesses.filter((a) => a.scopeType === ScopeType.OFFICE && a.scopeId).map((a) => a.scopeId as string);
    const countryIds = accesses.filter((a) => a.scopeType === ScopeType.COUNTRY && a.scopeId).map((a) => a.scopeId as string);
    const cityIds = accesses.filter((a) => a.scopeType === ScopeType.CITY && a.scopeId).map((a) => a.scopeId as string);

    const [offices, countries, cities] = await Promise.all([
      officeIds.length
        ? this.prisma.office.findMany({ where: { id: { in: officeIds } }, select: { id: true, name: true, code: true } })
        : Promise.resolve([]),
      countryIds.length
        ? this.prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true, name: true, code: true } })
        : Promise.resolve([]),
      cityIds.length
        ? this.prisma.city.findMany({
            where: { id: { in: cityIds } },
            select: { id: true, name: true, slug: true, country: { select: { id: true, name: true, code: true } } },
          })
        : Promise.resolve([]),
    ]);

    const officeMap = new Map(offices.map((o) => [o.id, o]));
    const countryMap = new Map(countries.map((c) => [c.id, c]));
    const cityMap = new Map(cities.map((c) => [c.id, c]));

    return accesses.map((a) => {
      let target: any = null;
      if (a.scopeType === ScopeType.OFFICE && a.scopeId) target = officeMap.get(a.scopeId) ?? null;
      else if (a.scopeType === ScopeType.COUNTRY && a.scopeId) target = countryMap.get(a.scopeId) ?? null;
      else if (a.scopeType === ScopeType.CITY && a.scopeId) target = cityMap.get(a.scopeId) ?? null;
      return {
        id: a.id,
        scopeType: a.scopeType,
        scopeId: a.scopeId,
        target,
        expiresAt: a.expiresAt,
        grantedAt: a.grantedAt,
        notes: a.notes,
      };
    });
  }

  /**
   * Resolve the active scope (with target name) for a given JWT payload.
   * Returns null for personal tokens or when accessId is missing/invalid.
   * Used by /auth/me so the frontend can render the scope indicator without
   * an extra round-trip to /auth/my-accesses.
   */
  async resolveAccessTarget(payload: JwtPayload) {
    if (payload.kind !== 'scoped' || !payload.accessId) return null;
    const access = await this.prisma.userAccess.findUnique({
      where: { id: payload.accessId },
    });
    if (!access || access.userId !== payload.sub) return null;
    if (access.revokedAt) return null;
    if (access.expiresAt && access.expiresAt.getTime() <= Date.now()) return null;

    let target: any = null;
    if (access.scopeType === ScopeType.OFFICE && access.scopeId) {
      target = await this.prisma.office.findUnique({
        where: { id: access.scopeId },
        select: { id: true, name: true, code: true },
      });
    } else if (access.scopeType === ScopeType.COUNTRY && access.scopeId) {
      target = await this.prisma.country.findUnique({
        where: { id: access.scopeId },
        select: { id: true, name: true, code: true },
      });
    } else if (access.scopeType === ScopeType.CITY && access.scopeId) {
      target = await this.prisma.city.findUnique({
        where: { id: access.scopeId },
        select: {
          id: true,
          name: true,
          slug: true,
          country: { select: { id: true, name: true, code: true } },
        },
      });
    }

    return {
      id: access.id,
      scopeType: access.scopeType,
      scopeId: access.scopeId,
      target,
      expiresAt: access.expiresAt,
    };
  }
}
