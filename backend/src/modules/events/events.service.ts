import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { visibleCityIds, visibleCountryIds } from '../../common/auth/scope.util';

const AURA_BASE = 'https://aura-tickets-api-production.up.railway.app';
const TICKETS_PATH = '/api/tickets/?show_all_for_admin=true';
const LOGIN_PATH = '/api/auth/login/';
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  ts: number;
  data: unknown;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');
  private cache: CacheEntry | null = null;
  private auraToken: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async loginAura(): Promise<string | null> {
    const username = this.config.get<string>('AURA_USERNAME');
    const password = this.config.get<string>('AURA_PASSWORD');
    if (!username || !password) {
      this.logger.warn('AURA_USERNAME / AURA_PASSWORD not set, skipping login');
      return null;
    }
    try {
      const res = await fetch(`${AURA_BASE}${LOGIN_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        this.logger.warn(`Aura login failed: ${res.status}`);
        return null;
      }
      const j = (await res.json()) as { access?: string; token?: string };
      return j.access ?? j.token ?? null;
    } catch (e: any) {
      this.logger.error(`Aura login error: ${e.message}`);
      return null;
    }
  }

  private async fetchTickets(): Promise<unknown> {
    if (!this.auraToken) this.auraToken = await this.loginAura();
    const headers: Record<string, string> = {};
    if (this.auraToken) headers.Authorization = `Bearer ${this.auraToken}`;
    let res = await fetch(`${AURA_BASE}${TICKETS_PATH}`, { headers });
    if (res.status === 401) {
      this.auraToken = await this.loginAura();
      if (this.auraToken) headers.Authorization = `Bearer ${this.auraToken}`;
      res = await fetch(`${AURA_BASE}${TICKETS_PATH}`, { headers });
    }
    if (!res.ok) {
      this.logger.warn(`Aura tickets fetch failed: ${res.status}`);
      return [];
    }
    return res.json();
  }

  async list(user: AuthUser): Promise<unknown> {
    const now = Date.now();
    if (!this.cache || now - this.cache.ts > TTL_MS) {
      const data = await this.fetchTickets();
      this.cache = { ts: now, data };
    }
    const data = this.cache.data;
    if (user.role === Role.ADMIN || user.role === Role.OFFICE) return data;

    // For COUNTRY/MANAGER, filter by city name if events have a city/country field.
    const allowedCities = await visibleCityIds(this.prisma, user);
    const allowedCountries = await visibleCountryIds(this.prisma, user);
    const cityNames = allowedCities
      ? (
          await this.prisma.city.findMany({ where: { id: { in: allowedCities } } })
        ).map((c) => c.name.toLowerCase())
      : [];
    const countryCodes = allowedCountries
      ? (
          await this.prisma.country.findMany({ where: { id: { in: allowedCountries } } })
        ).map((c) => c.code.toLowerCase())
      : [];

    if (!Array.isArray(data)) return data;
    return (data as Array<Record<string, unknown>>).filter((item) => {
      const city = String((item as any).city ?? (item as any).city_name ?? '').toLowerCase();
      const country = String(
        (item as any).country ?? (item as any).country_code ?? '',
      ).toLowerCase();
      if (cityNames.some((c) => city.includes(c))) return true;
      if (countryCodes.some((c) => country.includes(c))) return true;
      return false;
    });
  }
}
