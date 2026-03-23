import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
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

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
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
    const tokens = await this.generateTokens(user);

    this.logger.log(`User ${user.username} (${user.role}) logged in`);

    return { user, tokens };
  }

  async refresh(refreshTokenValue: string): Promise<TokenPair> {
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

    // Rotate: revoke old token and issue new pair
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const user: AuthenticatedUser = {
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

    return this.generateTokens(user);
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

  private async generateTokens(user: AuthenticatedUser): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      officeId: user.officeId,
      countryId: user.countryId,
      cityId: user.cityId,
    };

    const accessToken = this.jwtService.sign(payload);

    // Create refresh token
    const refreshTokenValue = uuidv4();
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7); // 7 days

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
}
