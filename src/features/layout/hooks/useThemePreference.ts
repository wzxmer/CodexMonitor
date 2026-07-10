import { useEffect, useState } from "react";
import type { ThemePreference } from "../../../types";

type ResolvedTheme = Exclude<ThemePreference, "system">;

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? "dark" : "light";
}

export function useThemePreference(theme: ThemePreference) {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      delete root.dataset.theme;
      return;
    }
    root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (theme !== "system" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(DARK_SCHEME_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  return theme === "system" ? systemTheme : theme;
}
