import { ForbiddenException } from '@nestjs/common';
import { AccessScope, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.types';

/**
 * Helper: returns true if `user` is allowed to act on `cityId`.
 * Rules:
 *   - ADMIN / OFFICE  → any city
 *   - COUNTRY         → city must belong to one of their countries
 *   - MANAGER         → city must be in their accesses
 */
export async function canAccessCity(
  prisma: PrismaService,
  user: AuthUser,
  cityId: string,
): Promise<boolean> {
  if (user.role === Role.ADMIN || user.role === Role.OFFICE) return true;
  if (user.role === Role.MANAGER) {
    return user.accesses.some(
      (a) => a.scope === AccessScope.CITY && a.cityId === cityId,
    );
  }
  if (user.role === Role.COUNTRY) {
    const allowedCountries = user.accesses
      .filter((a) => a.scope === AccessScope.COUNTRY && a.countryId)
      .map((a) => a.countryId as string);
    if (allowedCountries.length === 0) return false;
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { countryId: true } });
    if (!city) return false;
    return allowedCountries.includes(city.countryId);
  }
  return false;
}

export async function requireCityAccess(
  prisma: PrismaService,
  user: AuthUser,
  cityId: string,
): Promise<void> {
  const ok = await canAccessCity(prisma, user, cityId);
  if (!ok) throw new ForbiddenException('NO_CITY_ACCESS');
}

/**
 * Returns the list of cityIds that this user is allowed to see.
 * `null` means "no restriction" (admin / office).
 */
export async function visibleCityIds(
  prisma: PrismaService,
  user: AuthUser,
): Promise<string[] | null> {
  if (user.role === Role.ADMIN || user.role === Role.OFFICE) return null;
  if (user.role === Role.MANAGER) {
    return user.accesses
      .filter((a) => a.scope === AccessScope.CITY && a.cityId)
      .map((a) => a.cityId as string);
  }
  if (user.role === Role.COUNTRY) {
    const countryIds = user.accesses
      .filter((a) => a.scope === AccessScope.COUNTRY && a.countryId)
      .map((a) => a.countryId as string);
    if (countryIds.length === 0) return [];
    const cities = await prisma.city.findMany({
      where: { countryId: { in: countryIds } },
      select: { id: true },
    });
    return cities.map((c) => c.id);
  }
  return [];
}

export async function visibleCountryIds(
  prisma: PrismaService,
  user: AuthUser,
): Promise<string[] | null> {
  if (user.role === Role.ADMIN || user.role === Role.OFFICE) return null;
  if (user.role === Role.COUNTRY) {
    return user.accesses
      .filter((a) => a.scope === AccessScope.COUNTRY && a.countryId)
      .map((a) => a.countryId as string);
  }
  if (user.role === Role.MANAGER) {
    const cityIds = user.accesses
      .filter((a) => a.scope === AccessScope.CITY && a.cityId)
      .map((a) => a.cityId as string);
    if (cityIds.length === 0) return [];
    const cities = await prisma.city.findMany({
      where: { id: { in: cityIds } },
      select: { countryId: true },
    });
    return [...new Set(cities.map((c) => c.countryId))];
  }
  return [];
}
