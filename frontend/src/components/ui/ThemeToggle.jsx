import { useEffect } from 'react';
import { create } from 'zustand';

const useTheme = create((set) => ({
  theme: localStorage.getItem('theme') || 'dark',
  toggle() {
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    });
  },
}));

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <button
      onClick={toggle}
      className={`btn btn-ghost btn-icon ${className}`}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      aria-label="Переключить тему"
    >
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  );
}
