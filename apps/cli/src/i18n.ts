export type Lang = "en" | "fr";

/**
 * Language of the command line: --lang en|fr, otherwise GOLIVE_LANG, otherwise English.
 * Read from argv before commander runs, so help texts are translated too.
 */
export function detectLang(argv = process.argv, env = process.env): Lang {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--lang") value = argv[i + 1];
    else if (a.startsWith("--lang=")) value = a.slice(7);
  }
  value ??= env.GOLIVE_LANG;
  return value?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export const lang: Lang = detectLang();

/** Picks the text for the current language. */
export const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);
