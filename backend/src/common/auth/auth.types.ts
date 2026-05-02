import { AccessScope, Role } from '@prisma/client';

export type TokenKind = 'personal' | 'session';

export interface ScopeContext {
  scope: AccessScope;
  countryId: string | null;
  cityId: string | null;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  kind: TokenKind;
  accessId?: string;
  scope?: ScopeContext;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  kind: TokenKind;
  accessId?: string;
  scope?: ScopeContext;
  /** for COUNTRY/MANAGER/OFFICE: list of all their accesses (used for scope filtering) */
  accesses: Array<{
    id: string;
    scope: AccessScope;
    countryId: string | null;
    cityId: string | null;
  }>;
}
