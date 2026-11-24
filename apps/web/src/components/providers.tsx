"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { TooltipPrimitive } from "./ui";

export type ThemePref = "system" | "light" | "dark";

const ThemeCtx = createContext<{ pref: ThemePref; set: (p: ThemePref) => void }>({ pref: "system", set: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    try {
      setPref((localStorage.getItem("golive.theme") as ThemePref) || "system");
    } catch {}
  }, []);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = pref === "dark" || (pref === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  const set = useCallback((p: ThemePref) => {
    setPref(p);
    try {
      localStorage.setItem("golive.theme", p);
    } catch {}
  }, []);

  return (
    <ThemeCtx.Provider value={{ pref, set }}>
      <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>
    </ThemeCtx.Provider>
  );
}
