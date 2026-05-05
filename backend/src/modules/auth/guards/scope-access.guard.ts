import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopeType } from '@prisma/client';
import { JwtPayload } from '../auth.service';
import { REQUIRES_SCOPE_KEY } from '../decorators/requires-scope.decorator';

/**
 * Verifies that the request carries a scoped token (kind='scoped') and that
 * its scope matches the @RequiresScope() metadata. GLOBAL always passes.
 *
 * NOTE: This guard expects to run AFTER JwtAuthGuard so that request.user and
 * the verified JWT payload are present. Attach the payload to request.jwtPayload
 * in JwtStrategy if you need fine-grained checks; for now we reread it from
 * request.user fields populated by JwtStrategy and verify request.scope below.
 */
@Injectable()
export class ScopeAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const payload: JwtPayload | undefined = request.jwtPayload;

    if (!payload) {
      throw new ForbiddenException('Scope information missing');
    }
    if (payload.kind !== 'scoped') {
      throw new ForbiddenException('Scoped token required');
    }

    const allowed =
      this.reflector.getAllAndOverride<ScopeType[] | undefined>(
        REQUIRES_SCOPE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (payload.scopeType === ScopeType.GLOBAL) return true;
    if (allowed.length === 0) return true;
    if (!payload.scopeType || !allowed.includes(payload.scopeType)) {
      throw new ForbiddenException('Scope not permitted for this resource');
    }
    return true;
  }
}
