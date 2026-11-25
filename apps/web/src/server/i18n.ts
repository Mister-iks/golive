import type { NextRequest } from "next/server";
import { LANG_COOKIE, resolveLang, type Lang } from "@/i18n";

/** A message the API returns in the caller's language. */
export type Msg = string | { en: string; fr: string };
export const L = (en: string, fr: string): Msg => ({ en, fr });
export const pick = (m: Msg, lang: Lang) => (typeof m === "string" ? m : m[lang]);

/** Language chosen in the interface (cookie), English otherwise. */
export function langOf(req: Pick<NextRequest, "cookies"> | Request | undefined | null): Lang {
  if (!req) return "en";
  if ("cookies" in req && typeof (req as NextRequest).cookies?.get === "function") return resolveLang((req as NextRequest).cookies.get(LANG_COOKIE)?.value);
  const raw = (req as Request).headers?.get("cookie") ?? "";
  // Plain parsing: no regular expression built from the cookie name.
  const pair = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LANG_COOKIE}=`));
  return resolveLang(pair?.slice(LANG_COOKIE.length + 1));
}
