import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // Sidebar state
  sidebarOpen: false,
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));

// ─────────────────────────────────────────────────────────────
// Global Filter Store — used across all pages except Chat/Profile
// ─────────────────────────────────────────────────────────────
export const useFilterStore = create((set, get) => ({
  // Filter state
  countryId: '',
  cityId: '',
  eventId: '',
  
  // Available options (loaded from API)
  countries: [],
  cities: [],
  events: [],
  
  // Setters with cascade reset
  setCountryId: (countryId) => set({ countryId, cityId: '', eventId: '' }),
  setCityId: (cityId) => set({ cityId, eventId: '' }),
  setEventId: (eventId) => set({ eventId }),
  
  // Batch set options
  setCountries: (countries) => set({ countries }),
  setCities: (cities) => set({ cities }),
  setEvents: (events) => set({ events }),
  
  // Reset all filters
  resetFilters: () => set({ countryId: '', cityId: '', eventId: '' }),
  
  // Check if any filter is active
  hasActiveFilters: () => {
    const s = get();
    return !!(s.countryId || s.cityId || s.eventId);
  },
}));

// ─────────────────────────────────────────────────────────────
// Sidebar Badge Counts Store — for red notification badges
// ─────────────────────────────────────────────────────────────
export const useBadgeStore = create((set) => ({
  pendingCount: 0,
  problematicCount: 0,
  incomingCount: 0,
  companyLossCount: 0,
  
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setProblematicCount: (problematicCount) => set({ problematicCount }),
  setIncomingCount: (incomingCount) => set({ incomingCount }),
  setCompanyLossCount: (companyLossCount) => set({ companyLossCount }),
  
  // Fetch all counts
  refreshCounts: async (transfersApi, inventoryApi) => {
    try {
      const pendingPromise = transfersApi.getAll({ status: 'SENT', direction: 'sent', limit: 1 });
      const problematicPromise = transfersApi.getProblematic({ limit: 1 });
      const incomingPromise = transfersApi.getPending();
      
      const [pendingRes, problematicRes, incomingRes] = await Promise.all([
        pendingPromise,
        problematicPromise,
        incomingPromise,
      ]);
      
      const pendingCount = pendingRes.data?.meta?.total || 0;
      const problematicCount = problematicRes.data?.meta?.total || 0;
      const incomingPayload = incomingRes.data?.data || incomingRes.data;
      const incomingCount = Array.isArray(incomingPayload) ? incomingPayload.length : 0;
      
      // Fetch company loss count if inventoryApi is passed
      let companyLossCount = 0;
      if (inventoryApi) {
        try {
          const lossRes = await inventoryApi.getCompanyLossesSummary();
          companyLossCount = lossRes.data?.count || 0;
        } catch (e) {
          // Ignore if not available
        }
      }
      
      set({ pendingCount, problematicCount, incomingCount, companyLossCount });
    } catch (err) {
      console.error('Failed to refresh badge counts:', err);
    }
  },
}));
