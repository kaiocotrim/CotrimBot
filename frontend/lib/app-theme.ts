export type ThemePreference = "dark" | "light" | "system";
export const THEME_STORAGE_KEY = "cotrimbot:theme";
const THEME_EVENT = "cotrimbot:theme-change";
let sessionTheme: ThemePreference | null = null;

export function readTheme(): ThemePreference {
  if (sessionTheme) return sessionTheme;
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "system" || value === "dark" ? value : sessionTheme ?? "dark";
  } catch { return sessionTheme ?? "dark"; }
}

export function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function applyTheme(preference: ThemePreference) {
  const theme = preference === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111113" : "#fafafa");
}

export function setTheme(preference: ThemePreference) {
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); sessionTheme = null; } catch { sessionTheme = preference; }
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
}

// Executa antes da hidratação para evitar um flash de tema ao reabrir o app.
export const themeBootstrap = `try{var p=localStorage.getItem("${THEME_STORAGE_KEY}"),t=p==="light"||p==="system"?p:"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t}catch(e){}`;
