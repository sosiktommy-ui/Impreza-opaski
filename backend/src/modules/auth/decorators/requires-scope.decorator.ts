import { SetMetadata } from '@nestjs/common';
import { ScopeType } from '@prisma/client';

export const REQUIRES_SCOPE_KEY = 'requires_scope';

/**
 * Marker decorator for ScopeAccessGuard.
 * Pass an array of allowed ScopeType values, or omit to allow any scoped token.
 * GLOBAL passes regardless of `allowed`.
 */
export const RequiresScope = (...allowed: ScopeType[]) =>
  SetMetadata(REQUIRES_SCOPE_KEY, allowed);
