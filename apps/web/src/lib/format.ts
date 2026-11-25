import { stringifySpec, type Spec } from "@golive/spec";
import { LOCALE, type Lang } from "@/i18n";

const rtfs: Partial<Record<Lang, Intl.RelativeTimeFormat>> = {};
const rtfFor = (lang: Lang) => (rtfs[lang] ??= new Intl.RelativeTimeFormat(lang, { numeric: "auto" }));

/** Relative time ("3 minutes ago"), in the given language (English by default). */
export function ago(iso: string, lang: Lang = "en"): string {
  const rtf = rtfFor(lang);
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return lang === "fr" ? "à l'instant" : "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString(LOCALE[lang], { day: "numeric", month: "short", year: "numeric" });
}

/** "24 November 2026", in the given language (English by default). */
export function longDate(iso: string, lang: Lang = "en") {
  return new Date(iso).toLocaleDateString(LOCALE[lang], { day: "numeric", month: "long", year: "numeric" });
}

export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
}

export function exportYaml(spec: Spec) {
  download("golive.yaml", `# GoLive Spec: ${spec.project.name}\n${stringifySpec(spec)}`, "application/yaml");
}
