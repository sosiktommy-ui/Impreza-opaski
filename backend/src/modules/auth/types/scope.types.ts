/**
 * Phase 4 foundation — placeholder types for two-step (personal + scoped) auth.
 * NOT used by runtime yet. Wired in Phase 2 (two-step login backend).
 */
import { ScopeType } from '@prisma/client';

export interface Scope {
  type: ScopeType;
  /** null when type === 'GLOBAL' */
  id: string | null;
}

/** Token issued right after username/password login. No scope yet. */
export interface PersonalJwtPayload {
  sub: string; // user.id
  username: string;
  kind: 'personal';
  iat?: number;
  exp?: number;
}

/** Short-lived token issued after the user picks/switches a scope. */
export interface ScopedJwtPayload {
  sub: string; // user.id
  username: string;
  kind: 'scoped';
  scope: Scope;
  /** UserAccess.id this token was minted from — used to detect revocation. */
  accessId: string;
  iat?: number;
  exp?: number;
}

export type AnyJwtPayload = PersonalJwtPayload | ScopedJwtPayload;
