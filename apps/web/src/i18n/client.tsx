"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { catalog } from "@golive/spec";
import { LANG_COOKIE, type Lang } from "./index";

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    set(l);
    // A year-long cookie: the server renders the next pages and API errors in the same language.
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** Messages of one area in the current language. */
export function useMessages<M>(messages: Record<Lang, M>): M {
  return messages[useLang().lang];
}

/** Component kinds, actors, countries… in the current language. */
export function useCatalog() {
  const { lang } = useLang();
  return useMemo(() => catalog(lang), [lang]);
}
