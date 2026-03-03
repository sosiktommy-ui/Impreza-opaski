import { create } from 'zustand';

const THEME_KEY = 'impreza_theme';

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {}
  return 'light';
};

export const useThemeStore = create((set) => ({
  theme: getInitialTheme(),

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      return { theme: next };
    }),

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
}));
