import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth.service';

/**
 * Allows requests carrying a valid JWT with kind='personal' only.
 * Used by the second step of the two-step login (POST /auth/select-scope).
 */
@Injectable()
export class PersonalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice(7);
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (payload.kind !== 'personal') {
      throw new UnauthorizedException('Personal token required');
    }
    request.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      officeId: null,
      countryId: null,
      cityId: null,
    };
    request.jwtPayload = payload;
    return true;
  }
}
