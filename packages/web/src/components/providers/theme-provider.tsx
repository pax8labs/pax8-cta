/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

// Helper function to apply theme to document
function applyThemeToDocument(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// Helper to resolve theme based on setting and system preference
function resolveThemeValue(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light"; // Default for SSR
  }
  return theme;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Default to light mode
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // Always start with light mode, ignore stored preferences
  useEffect(() => {
    // Always default to light mode
    setThemeState("light");
    try {
      localStorage.setItem("agentsync-theme", "light");
    } catch (e) {
      console.error("Failed to save theme to localStorage:", e);
    }
    setMounted(true);
  }, []);

  // Resolve the actual theme (light or dark) based on setting and system preference
  useEffect(() => {
    if (!mounted) return;

    const resolved = resolveThemeValue(theme);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
  }, [theme, mounted]);

  // Listen for system preference changes
  useEffect(() => {
    if (!mounted || theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? "dark" : "light";
      setResolvedTheme(newResolved);
      applyThemeToDocument(newResolved);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, mounted]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    // Save to localStorage for inline script to prevent flash
    try {
      localStorage.setItem("agentsync-theme", newTheme);
    } catch (e) {
      console.error("Failed to save theme to localStorage:", e);
    }
    // The settings page handles saving to API when user changes the setting
  }, []);

  // Return children immediately to avoid hydration mismatch
  // The theme will be applied after mount via useEffect
  // This prevents the flash of unstyled content while maintaining SSR compatibility
  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
