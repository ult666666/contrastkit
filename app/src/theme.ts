import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'contrastkit-theme';

/** Reads the saved theme. Storage can be unavailable (private browsing), so never throw. */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * The page follows the operating system's light/dark preference unless the person picks
 * one. The choice is stored as `data-theme` on <html>; the CSS uses light-dark() with
 * `color-scheme`, so each theme is one attribute away. index.html applies the saved choice
 * before first paint to avoid a flash of the wrong theme.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable: the theme still applies for this visit.
    }
  }, [theme]);
  return [theme, setTheme];
}
