import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload, TokenKind } from './auth.types';

const extractToken = (req: Request): string | null => {
  const h = req.headers.authorization;
  if (!h) return null;
  const [type, token] = h.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
};

async function loadAuthUser(
  prisma: PrismaService,
  payload: JwtPayload,
): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { accesses: true },
  });
  if (!user || !user.isActive) throw new UnauthorizedException('USER_INACTIVE');
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    kind: payload.kind,
    accessId: payload.accessId,
    scope: payload.scope,
    accesses: user.accesses.map((a) => ({
      id: a.id,
      scope: a.scope,
      countryId: a.countryId,
      cityId: a.cityId,
    })),
  };
}

function makeGuard(expectedKind: TokenKind | 'any') {
  @Injectable()
  class Guard implements CanActivate {
    constructor(
      public readonly jwt: JwtService,
      public readonly config: ConfigService,
      public readonly prisma: PrismaService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req = ctx.switchToHttp().getRequest<Request>();
      const token = extractToken(req);
      if (!token) throw new UnauthorizedException('NO_TOKEN');
      let payload: JwtPayload;
      try {
        payload = await this.jwt.verifyAsync<JwtPayload>(token, {
          secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        });
      } catch {
        throw new UnauthorizedException('INVALID_TOKEN');
      }
      if (expectedKind !== 'any' && payload.kind !== expectedKind) {
        throw new UnauthorizedException(`EXPECTED_${expectedKind.toUpperCase()}_TOKEN`);
      }
      req.user = await loadAuthUser(this.prisma, payload);
      return true;
    }
  }
  return Guard;
}

export const JwtAuthGuard = makeGuard('session');
export const PersonalAuthGuard = makeGuard('personal');
export const AnyAuthGuard = makeGuard('any');
