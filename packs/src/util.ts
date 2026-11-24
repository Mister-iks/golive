import { notRun, notScanned, type Finding, type RepoObservation, type RuleContext, type WebObservation } from "@golive/packs-sdk";

/** Run a layer 3 check only when a successful web observation exists. */
export function withWeb(ctx: RuleContext, fn: (web: WebObservation) => Finding | Finding[]): Finding | Finding[] {
  if (!ctx.web) return notRun();
  if (!ctx.web.ok) return notRun("Le site n'a pas pu être audité.");
  return fn(ctx.web);
}

/** Run a layer 2 check only when the repository was scanned. */
export function withRepo(ctx: RuleContext, fn: (repo: RepoObservation) => Finding | Finding[]): Finding | Finding[] {
  if (!ctx.repo) return notScanned();
  return fn(ctx.repo);
}

/** Dev and test compose files are expected to publish ports for local work. */
export const isLocalFile = (file: string) => /(^|[./_-])(dev|local|test|ci|example)([./_-]|$)/i.test(file.slice(file.lastIndexOf("/") + 1));

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Detects a link to a page whose text or URL matches one of the patterns. */
export function findLink(web: WebObservation, patterns: RegExp[]): { href: string; text: string } | undefined {
  return web.html?.links.find((l) => patterns.some((p) => p.test(l.text) || p.test(decodeSafe(l.href))));
}

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const list = (items: string[]) => items.join(", ");
