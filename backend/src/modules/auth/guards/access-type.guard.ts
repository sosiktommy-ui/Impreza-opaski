import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessType } from '@prisma/client';
import { JwtPayload } from '../auth.service';
import { ALLOW_ACCESS_TYPES_KEY } from '../decorators/allow-access-types.decorator';

@Injectable()
export class AccessTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccessType[] | undefined>(
      ALLOW_ACCESS_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const payload: JwtPayload | undefined = request.jwtPayload;

    if (!payload || payload.kind !== 'scoped') {
      throw new ForbiddenException('Scoped token required');
    }

    if (!payload.accessType) {
      throw new ForbiddenException('Access type is missing in token');
    }

    if (!required.includes(payload.accessType)) {
      throw new ForbiddenException(
        `Access type ${payload.accessType} is not allowed for this operation`,
      );
    }

    return true;
  }
}
