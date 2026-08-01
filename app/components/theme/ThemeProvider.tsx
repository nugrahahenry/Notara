'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'notara-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeTheme(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const preferenceRef = useRef<ThemePreference>('system');

  const applyTheme = useCallback((nextPreference: ThemePreference) => {
    const resolvedTheme = resolveTheme(nextPreference);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = nextPreference;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, []);

  useEffect(() => {
    const initialPreference = normalizeTheme(
      document.documentElement.dataset.themePreference
        ?? localStorage.getItem(THEME_STORAGE_KEY),
    );
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (preferenceRef.current === 'system') applyTheme('system');
    };

    preferenceRef.current = initialPreference;
    const preferenceSyncTimer = initialPreference === 'system'
      ? undefined
      : window.setTimeout(() => setPreferenceState(initialPreference), 0);
    applyTheme(initialPreference);
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      if (preferenceSyncTimer !== undefined) window.clearTimeout(preferenceSyncTimer);
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [applyTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    preferenceRef.current = nextPreference;
    setPreferenceState(nextPreference);
    applyTheme(nextPreference);
  }, [applyTheme]);

  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
