import { useState } from "react";

export type Theme = "dark" | "light";

const KEY = "winddesk.theme";

/** The initial theme is applied by an inline script in index.html to avoid a flash. */
const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current);
  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable: theme lasts for this page only */
    }
  };
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
