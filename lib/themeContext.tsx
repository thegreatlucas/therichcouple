'use client';
// lib/themeContext.tsx — Dark/Light mode global

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', isDark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = localStorage.getItem('rc-theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: Theme = saved ?? (prefersDark ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('rc-theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }

  return <Ctx.Provider value={{ theme, isDark: theme === 'dark', toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);