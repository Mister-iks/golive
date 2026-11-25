/**
 * Interface languages. English is the default; French is complete.
 * Messages live next to the area they belong to, in i18n/messages/<area>.ts, as
 * defineMessages({ en: {...}, fr: {...} }). The French object must have exactly
 * the same keys as the English one, which the compiler checks.
 */
export type Lang = "en" | "fr";
export const LANGS: readonly Lang[] = ["en", "fr"];
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "golive.lang";
export const LANG_NAMES: Record<Lang, string> = { en: "English", fr: "Français" };

export const isLang = (v: unknown): v is Lang => v === "en" || v === "fr";
export const resolveLang = (v: unknown): Lang => (isLang(v) ? v : DEFAULT_LANG);

type Widen<T> = T extends string ? string : T extends (...args: infer A) => infer R ? (...args: A) => Widen<R> : { [K in keyof T]: Widen<T[K]> };

/** Declares the messages of one area in every language. Strings, or functions for interpolation and plurals. */
export function defineMessages<T extends object>(m: { en: T; fr: Widen<T> }): Record<Lang, Widen<T>> {
  return m as unknown as Record<Lang, Widen<T>>;
}

/** Locale for dates and numbers. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", fr: "fr-FR" };
