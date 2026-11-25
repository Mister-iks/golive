"use client";

import { useRouter } from "next/navigation";
import { LANG_NAMES, LANGS } from "@/i18n";
import { useLang } from "@/i18n/client";
import { cx } from "./ui";

/** EN / FR switch. The choice is kept in a cookie and applies to the whole interface. */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  const router = useRouter();
  return (
    <div role="radiogroup" aria-label="Language / Langue" className={cx("inline-flex rounded-md border border-line bg-surface p-0.5", className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          title={LANG_NAMES[l]}
          onClick={() => {
            if (l === lang) return;
            setLang(l);
            // Server-rendered parts follow the cookie.
            router.refresh();
          }}
          className={cx(
            "h-5 rounded-[4px] px-1.5 font-mono text-[10.5px] font-medium uppercase transition-colors",
            lang === l ? "bg-sunken text-fg" : "text-fg-3 hover:text-fg",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
