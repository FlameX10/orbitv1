import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'orbit-theme';
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function savedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f4fa' : '#07080c');
}

/**
 * Follows the device's light/dark setting until the user picks one with the
 * toggle; that choice is then remembered on this device.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || savedTheme() || systemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Track the system setting while the user has not chosen explicitly.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return undefined;
    const onChange = () => {
      if (!savedTheme()) setTheme(media.matches ? 'light' : 'dark');
    };
    // Also re-check when the tab regains focus, in case a change event was missed.
    const onVisible = () => { if (document.visibilityState === 'visible') onChange(); };
    media.addEventListener?.('change', onChange);
    window.addEventListener('focus', onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      media.removeEventListener?.('change', onChange);
      window.removeEventListener('focus', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    setTheme(current => {
      const next = current === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
      return next;
    });
    window.setTimeout(() => root.classList.remove('theme-switching'), 450);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
