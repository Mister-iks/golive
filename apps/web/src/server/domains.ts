import { resolveTxt } from "node:dns/promises";
import { assertUrlAllowed } from "@golive/probe";
import { and, domainVerifications, eq, isNotNull, type Tx } from "@golive/db";
import type { Lang } from "@/i18n";

export const DOMAIN_FILE = "/.well-known/pcybox-golive.txt";
export const DNS_PREFIX = "_pcybox-golive";

export function normalizeHost(input: string): string {
  const raw = input.trim().toLowerCase();
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    throw new Error("invalid");
  }
  if (!/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}$/.test(host)) throw new Error("invalid");
  return host;
}

export const newToken = () => `pcybox-golive-verification=${crypto.randomUUID().replace(/-/g, "")}`;

/** A verified domain covers itself and all its subdomains. */
export async function isDomainVerified(tx: Tx, orgId: string, hostname: string): Promise<boolean> {
  const rows = await tx
    .select({ hostname: domainVerifications.hostname })
    .from(domainVerifications)
    .where(and(eq(domainVerifications.orgId, orgId), isNotNull(domainVerifications.verifiedAt)));
  const host = hostname.toLowerCase();
  return rows.some((r) => host === r.hostname || host.endsWith(`.${r.hostname}`));
}

/** Looks for the token in DNS (TXT on _pcybox-golive.<host> or <host>) then in the well-known file. */
export async function checkOwnership(hostname: string, token: string, lang: Lang = "en"): Promise<{ ok: boolean; method?: "dns" | "file"; detail: string }> {
  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
  for (const name of [`${DNS_PREFIX}.${hostname}`, hostname]) {
    try {
      const records = (await resolveTxt(name)).map((parts) => parts.join(""));
      if (records.some((r) => r.trim() === token)) return { ok: true, method: "dns", detail: t(`TXT record found on ${name}.`, `Enregistrement TXT trouvé sur ${name}.`) };
    } catch {}
  }
  try {
    const url = assertUrlAllowed(`https://${hostname}${DOMAIN_FILE}`, { allowPrivate: process.env.GOLIVE_ALLOW_PRIVATE === "1" });
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "PcyBoxGoLiveBot/0.1 (domain verification)" } });
    if (res.ok) {
      const text = (await res.text()).slice(0, 2000);
      if (text.split(/\s+/).includes(token)) return { ok: true, method: "file", detail: t(`File ${DOMAIN_FILE} found.`, `Fichier ${DOMAIN_FILE} trouvé.`) };
    }
  } catch {}
  return { ok: false, detail: t(
      `Token not found: no TXT record on ${DNS_PREFIX}.${hostname} and no file at https://${hostname}${DOMAIN_FILE}.`,
      `Jeton introuvable : ni TXT sur ${DNS_PREFIX}.${hostname}, ni fichier https://${hostname}${DOMAIN_FILE}.`,
    ) };
}
