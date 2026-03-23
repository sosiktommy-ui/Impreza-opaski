import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Globe, MapPin, Calendar, X, ChevronDown, Search } from 'lucide-react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../store/useAuthStore';
import { useFilterStore } from '../../store/useAppStore';
import { usersApi } from '../../api/users';
import { eventsApi } from '../../api/events';

// Pages where GlobalFilterBar should NOT be shown
const EXCLUDED_PATHS = ['/chat', '/profile', '/users', '/login'];

// ─────────────────────────────────────────────────────────────────────────────
// GlobalFilterBar — Cascading filters: Country → City → Event
// ─────────────────────────────────────────────────────────────────────────────
function GlobalFilterBar() {
  const { user } = useAuthStore();
  const {
    countryId, cityId, eventId,
    setCountryId, setCityId, setEventId,
    countries, cities, events,
    setCountries, setCities, setEvents,
    resetFilters, hasActiveFilters,
  } = useFilterStore();

  const [countriesLoading, setCountriesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Role-based visibility
  const isAdmin = user?.role === 'ADMIN';
  const isOffice = user?.role === 'OFFICE';
  const isCountry = user?.role === 'COUNTRY';
  const isCity = user?.role === 'CITY';

  const showCountryFilter = isAdmin || isOffice;
  const showCityFilter = isAdmin || isOffice || isCountry;
  const showEventFilter = true; // All roles can filter by event

  // Load countries on mount for ADMIN/OFFICE
  useEffect(() => {
    if (showCountryFilter && countries.length === 0) {
      loadCountries();
    }
  }, [showCountryFilter]);

  // Load cities when country changes or on mount for COUNTRY role
  useEffect(() => {
    if (isCountry && cities.length === 0) {
      loadCities(user.countryId);
    } else if (countryId) {
      loadCities(countryId);
    } else {
      setCities([]);
    }
  }, [countryId, isCountry]);

  // Load events when city changes or based on role
  useEffect(() => {
    if (isCity) {
      loadEvents(user.cityId);
    } else if (cityId) {
      loadEvents(cityId);
    } else {
      setEvents([]);
    }
  }, [cityId, isCity]);

  const loadCountries = async () => {
    setCountriesLoading(true);
    try {
      const { data } = await usersApi.getCountries();
      const list = data?.data || data;
      setCountries(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load countries:', err);
    } finally {
      setCountriesLoading(false);
    }
  };

  const loadCities = async (cId) => {
    if (!cId) return;
    setCitiesLoading(true);
    try {
      const { data } = await usersApi.getCities(cId);
      const list = data?.data || data;
      setCities(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load cities:', err);
    } finally {
      setCitiesLoading(false);
    }
  };

  const loadEvents = async (cId) => {
    if (!cId) return;
    setEventsLoading(true);
    try {
      const { data } = await eventsApi.getEvents({ cityId: cId, active: true });
      const list = data?.data || data;
      setEvents(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const activeFilters = hasActiveFilters();

  return (
    <div className="bg-surface-card border border-edge rounded-[var(--radius-md)] p-3 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Country Filter */}
        {showCountryFilter && (
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-content-muted flex-shrink-0" />
            <div className="relative">
              <select
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                disabled={countriesLoading}
                className="appearance-none bg-surface-secondary border border-edge rounded-[var(--radius-sm)] pl-3 pr-8 py-1.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors min-w-[140px]"
              >
                <option value="">Все страны</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* City Filter */}
        {showCityFilter && (
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-content-muted flex-shrink-0" />
            <div className="relative">
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                disabled={citiesLoading || (!countryId && !isCountry)}
                className="appearance-none bg-surface-secondary border border-edge rounded-[var(--radius-sm)] pl-3 pr-8 py-1.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors min-w-[140px] disabled:opacity-50"
              >
                <option value="">Все города</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* Event Filter */}
        {showEventFilter && (
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-content-muted flex-shrink-0" />
            <div className="relative">
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                disabled={eventsLoading || (!cityId && !isCity)}
                className="appearance-none bg-surface-secondary border border-edge rounded-[var(--radius-sm)] pl-3 pr-8 py-1.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors min-w-[160px] disabled:opacity-50"
              >
                <option value="">Все мероприятия</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.name || e.eventName}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* Reset Button */}
        {activeFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-content-muted hover:text-content-primary hover:bg-surface-card-hover rounded-[var(--radius-sm)] transition-colors"
          >
            <X size={14} />
            <span>Сбросить</span>
          </button>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFilters && (
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-edge">
          <span className="text-xs text-content-muted">Активные фильтры:</span>
          {countryId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-500/10 text-brand-400 rounded-full text-xs">
              {countries.find(c => c.id === countryId)?.name || 'Страна'}
              <button onClick={() => setCountryId('')} className="hover:text-brand-300">
                <X size={12} />
              </button>
            </span>
          )}
          {cityId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs">
              {cities.find(c => c.id === cityId)?.name || 'Город'}
              <button onClick={() => setCityId('')} className="hover:text-emerald-300">
                <X size={12} />
              </button>
            </span>
          )}
          {eventId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full text-xs">
              {events.find(e => e.id === eventId)?.name || events.find(e => e.id === eventId)?.eventName || 'Мероприятие'}
              <button onClick={() => setEventId('')} className="hover:text-amber-300">
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const showFilterBar = !EXCLUDED_PATHS.some(p => location.pathname.startsWith(p));

  return (
    <div className="h-dvh flex flex-col bg-surface-primary">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface-primary p-4 lg:p-6">
          {showFilterBar && <GlobalFilterBar />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
