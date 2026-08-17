"use client";

import React, { createContext, useContext, useEffect, useState, useTransition } from "react";

export type Theme = "red-black" | "black-red";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "passie_theme";
const THEME_COOKIE_KEY = "passie_theme";

function applyThemeClass(newTheme: Theme) {
  const root = document.documentElement;
  if (newTheme === "black-red") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "black-red");
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "red-black");
  }
}

export function ThemeProvider({
  children,
  initialTheme = "red-black",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
        if (stored === "red-black" || stored === "black-red") {
          return stored;
        }
      } catch {
        // Ignore localStorage error
      }
    }
    return initialTheme;
  });

  const [, startTransition] = useTransition();

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    startTransition(() => {
      setThemeState(newTheme);
    });
    applyThemeClass(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      // Also set cookie so SSR / head can pick it up without flash
      document.cookie = `${THEME_COOKIE_KEY}=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Ignore storage errors
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "red-black" ? "black-red" : "red-black");
  };

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
