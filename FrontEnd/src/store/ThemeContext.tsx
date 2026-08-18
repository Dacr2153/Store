import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

interface ThemeCtx {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx | undefined>(undefined);

const KEY = "themeMode";

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

// Apply once at module load to avoid an initial flash before React mounts.
if (typeof window !== "undefined") {
  apply(readInitial());
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => readInitial());

  useEffect(() => {
    apply(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggle = useCallback(
    () => setModeState((m) => (m === "light" ? "dark" : "light")),
    []
  );

  return <Ctx.Provider value={{ mode, toggle, setMode }}>{children}</Ctx.Provider>;
};

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}
