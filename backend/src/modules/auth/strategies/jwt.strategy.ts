import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    // Personal tokens are only valid for the dedicated /auth/select-scope path,
    // which uses PersonalAuthGuard. Reject them everywhere else.
    if (payload.kind === 'personal') {
      throw new UnauthorizedException('Personal token cannot access this resource');
    }
    const user = await this.authService.getUserFromToken(payload);
    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }
    // Stash payload so guards (e.g. ScopeAccessGuard) can read scope info.
    if (req) req.jwtPayload = payload;
    return user;
  }
}
