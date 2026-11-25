import { notRun, notScanned, tr, type CrawlObservation, type Finding, type RepoObservation, type RuleContext, type WebObservation } from "@golive/packs-sdk";

/** Run a layer 3 check only when a successful web observation exists. */
export function withWeb(ctx: RuleContext, fn: (web: WebObservation) => Finding | Finding[]): Finding | Finding[] {
  if (!ctx.web) return notRun();
  if (!ctx.web.ok) return notRun(tr(ctx, "The site could not be audited.", "Le site n'a pas pu être audité."));
  return fn(ctx.web);
}

/** Run a check that needs the multi-page crawl of a full audit. */
export function withCrawl(ctx: RuleContext, fn: (crawl: CrawlObservation, web: WebObservation) => Finding | Finding[]): Finding | Finding[] {
  return withWeb(ctx, (web) => {
    if (!web.crawl) return notRun(tr(ctx, "No full audit yet: the robot has not browsed the site.", "Audit complet non lancé : le robot n'a pas encore parcouru le site."));
    if (!web.crawl.pages.some((p) => p.status !== null && p.status < 400)) return notRun(tr(ctx, "The robot could not load any page.", "Le robot n'a pu charger aucune page."));
    return fn(web.crawl, web);
  });
}

/** "3 pages", "1 page". Give the plural form when it is not word + "s". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n > 1 ? many : word}`;

export const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
};

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
