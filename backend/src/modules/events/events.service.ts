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
const CACHE_KEY = 'impreza:events';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

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

      const headers: Record<string, string> = {};
      const token = this.configService.get<string>('IMPREZA_API_TOKEN');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(IMPREZA_API_URL, { headers });

      if (!response.ok) {
        this.logger.warn(
          `IMPREZA API responded with ${response.status}: ${response.statusText}`,
        );
        return [];
      }

      const data = await response.json();
      const tickets: ImprezaTicket[] = Array.isArray(data)
        ? data
        : data?.tickets ?? data?.results ?? data?.data ?? [];

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
    } catch (error) {
      this.logger.error('Failed to fetch from IMPREZA API', error);
      return [];
    }
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
