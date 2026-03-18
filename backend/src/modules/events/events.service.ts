import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

interface ImprezaTicket {
  id: number;
  event_name: string;
  event_date: string;
  city_name: string;
  country_code: string;
  club_id?: number;
  venue?: string;
  [key: string]: unknown;
}

export interface EventInfo {
  id: number;
  title: string;
  date: string;
  city: string;
  country: string;
  venue?: string;
}

const IMPREZA_API_URL =
  'https://aura-tickets-api-production.up.railway.app/api/tickets/?show_all_for_admin=true';
const IMPREZA_LOGIN_URL =
  'https://aura-tickets-api-production.up.railway.app/api/admin/login';
const CACHE_KEY = 'impreza:events';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private cachedToken: string | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fetch events from IMPREZA Tickets API, deduplicate by event_title+event_date,
   * cache in Redis for 5 min.
   */
  async getEvents(filters?: {
    city?: string;
    country?: string;
  }): Promise<EventInfo[]> {
    let events = await this.getCachedEvents();

    if (!events) {
      events = await this.fetchFromImpreza();
      if (events.length > 0) {
        await this.cacheEvents(events);
      }
    }

    // Apply optional filters
    if (filters?.city) {
      const q = filters.city.toLowerCase();
      events = events.filter((e) => e.city.toLowerCase().includes(q));
    }
    if (filters?.country) {
      const q = filters.country.toLowerCase();
      events = events.filter((e) => e.country.toLowerCase().includes(q));
    }

    // Sort by date descending (newest first)
    events.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return events;
  }

  private async fetchFromImpreza(): Promise<EventInfo[]> {
    try {
      this.logger.log('Fetching events from IMPREZA Tickets API...');

      const token = await this.getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(IMPREZA_API_URL, { headers });

      // If 401 — token expired, try to re-login once
      if (response.status === 401 && token) {
        this.logger.warn('Token expired, re-authenticating...');
        this.cachedToken = null;
        const newToken = await this.getToken();
        if (newToken) {
          const retryResponse = await fetch(IMPREZA_API_URL, {
            headers: { 'Authorization': `Bearer ${newToken}` },
          });
          if (retryResponse.ok) {
            return this.parseTickets(await retryResponse.json());
          }
        }
        return [];
      }

      if (!response.ok) {
        this.logger.warn(
          `IMPREZA API responded with ${response.status}: ${response.statusText}`,
        );
        return [];
      }

      return this.parseTickets(await response.json());
    } catch (error) {
      this.logger.error('Failed to fetch from IMPREZA API', error);
      return [];
    }
  }

  private async getToken(): Promise<string | null> {
    // 1. Already cached in memory
    if (this.cachedToken) return this.cachedToken;

    // 2. Provided via env var
    const envToken = this.configService.get<string>('IMPREZA_API_TOKEN');
    if (envToken) {
      this.cachedToken = envToken;
      return envToken;
    }

    // 3. Auto-login with password
    const password = this.configService.get<string>('IMPREZA_API_PASSWORD');
    if (!password) {
      this.logger.warn('No IMPREZA_API_TOKEN or IMPREZA_API_PASSWORD configured');
      return null;
    }

    try {
      this.logger.log('Authenticating with IMPREZA Tickets API...');
      const res = await fetch(IMPREZA_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        this.logger.error(`IMPREZA login failed: ${res.status}`);
        return null;
      }

      const data = await res.json();
      const token = data?.token || data?.access_token;
      if (token) {
        this.cachedToken = token;
        this.logger.log('IMPREZA API authenticated successfully');
        return token;
      }
      this.logger.error('No token in IMPREZA login response');
      return null;
    } catch (error) {
      this.logger.error('IMPREZA login error', error);
      return null;
    }
  }

  private parseTickets(data: unknown): EventInfo[] {
    const tickets: ImprezaTicket[] = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.tickets ??
        (data as Record<string, unknown>)?.results ??
        (data as Record<string, unknown>)?.data ?? [];

    // Deduplicate by event_name + event_date
    const seen = new Map<string, EventInfo>();

    for (const t of tickets) {
      const key = `${(t.event_name || '').trim()}|${(t.event_date || '').trim()}`;
      if (!seen.has(key) && t.event_name) {
        seen.set(key, {
          id: t.id,
          title: t.event_name.trim(),
          date: t.event_date,
          city: (t.city_name || '').trim(),
          country: (t.country_code || '').trim(),
          venue: t.venue ? String(t.venue).trim() : undefined,
        });
      }
    }

    const events = [...seen.values()];
    this.logger.log(`Fetched ${events.length} unique events from IMPREZA`);
    return events;
  }

  private async getCachedEvents(): Promise<EventInfo[] | null> {
    try {
      const cached = await this.redis.get<EventInfo[]>(CACHE_KEY);
      return cached ?? null;
    } catch {
      // ignore cache errors
    }
    return null;
  }

  private async cacheEvents(events: EventInfo[]): Promise<void> {
    try {
      await this.redis.set(CACHE_KEY, events, CACHE_TTL);
    } catch {
      // ignore cache errors
    }
  }
}
