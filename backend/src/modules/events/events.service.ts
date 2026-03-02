import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

interface AuraTicket {
  id: number;
  event_title: string;
  event_date: string;
  city: string;
  country: string;
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

const AURA_API_URL =
  'https://aura-tickets-api-production.up.railway.app/api/tickets/?show_all_for_admin=true';
const CACHE_KEY = 'aura:events';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Fetch events from AURA Tickets API, deduplicate by event_title+event_date,
   * cache in Redis for 5 min.
   */
  async getEvents(filters?: {
    city?: string;
    country?: string;
  }): Promise<EventInfo[]> {
    let events = await this.getCachedEvents();

    if (!events) {
      events = await this.fetchFromAura();
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

  private async fetchFromAura(): Promise<EventInfo[]> {
    try {
      this.logger.log('Fetching events from AURA Tickets API...');
      const response = await fetch(AURA_API_URL);

      if (!response.ok) {
        this.logger.warn(
          `AURA API responded with ${response.status}: ${response.statusText}`,
        );
        return [];
      }

      const data = await response.json();
      const tickets: AuraTicket[] = Array.isArray(data)
        ? data
        : data?.results ?? data?.data ?? [];

      // Deduplicate by event_title + event_date
      const seen = new Map<string, EventInfo>();

      for (const t of tickets) {
        const key = `${(t.event_title || '').trim()}|${(t.event_date || '').trim()}`;
        if (!seen.has(key) && t.event_title) {
          seen.set(key, {
            id: t.id,
            title: t.event_title.trim(),
            date: t.event_date,
            city: (t.city || '').trim(),
            country: (t.country || '').trim(),
            venue: t.venue ? String(t.venue).trim() : undefined,
          });
        }
      }

      const events = [...seen.values()];
      this.logger.log(`Fetched ${events.length} unique events from AURA`);
      return events;
    } catch (error) {
      this.logger.error('Failed to fetch from AURA API', error);
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
