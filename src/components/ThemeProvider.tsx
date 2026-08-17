"use client";

import React, { createContext, useContext, useSyncExternalStore, useCallback } from "react";

export type Theme = "red-black" | "black-red";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "passie_theme";
const THEME_COOKIE_KEY = "passie_theme";
const THEME_CHANGE_EVENT = "passie_theme_change";

function applyThemeClass(newTheme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (newTheme === "black-red") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "black-red");
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "red-black");
  }
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "red-black";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "black-red" : "red-black";
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  const handleMediaChange = () => {
    // Only notify if user hasn't explicitly set a preference in localStorage
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      callback();
    }
  };
  mediaQuery?.addEventListener?.("change", handleMediaChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
    mediaQuery?.removeEventListener?.("change", handleMediaChange);
  };
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const getSnapshot = useCallback((): Theme => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (stored === "red-black" || stored === "black-red") {
        return stored;
      }
    } catch {
      // Ignore storage errors
    }
    if (initialTheme) {
      return initialTheme;
    }
    return getSystemTheme();
  }, [initialTheme]);

  const getServerSnapshot = useCallback((): Theme => {
    return initialTheme ?? "red-black";
  }, [initialTheme]);

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((newTheme: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      document.cookie = `${THEME_COOKIE_KEY}=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    } catch {
      // Ignore storage errors
    }
    applyThemeClass(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "red-black" ? "black-red" : "red-black");
  }, [theme, setTheme]);

  React.useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
