import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "gray";

const THEME_KEY = "th_theme";

function applyTheme(pref: ThemePreference) {
  document.documentElement.setAttribute("data-theme", pref);
  const themeColor = pref === "dark" ? "#17181c" : pref === "gray" ? "#d9dde3" : "#ffffff";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "gray") return stored;
  // Migrate the former "system" option to its replacement, the gray theme.
  return "gray";
}

/**
 * Theme preference is stored in localStorage, so it's a per-device/per-browser
 * setting (not synced across a user's computers), matching how favorites and
 * offline pages already work in this app.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    localStorage.setItem(THEME_KEY, next);
    setPreference(next);
  }, []);

  return { preference, setTheme };
}
