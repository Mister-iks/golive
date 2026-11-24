import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { AxeViolation, CrawledPage, CrawlObservation } from "@golive/packs-sdk";
import { assertUrlAllowed, USER_AGENT } from "@golive/probe";
import { startGuardProxy } from "./guard-proxy";

export { startGuardProxy } from "./guard-proxy";

export interface CrawlOptions {
  /** Pages to visit at most (Community: 20). */
  maxPages?: number;
  /** Overall time budget in milliseconds. */
  budgetMs?: number;
  pageTimeoutMs?: number;
  /** Allow private and loopback addresses (self-hosted internal pre-production only). */
  allowPrivate?: boolean;
  /** Run axe-core on each page (default true). */
  accessibility?: boolean;
  /** Browser to use: "chromium" (bundled), "chrome" or "msedge" (installed). */
  channel?: string;
  onProgress?: (p: { pages: number; maxPages: number; url: string }) => void;
}

const SKIP_EXT = /\.(pdf|zip|gz|rar|7z|tar|dmg|exe|msi|apk|docx?|xlsx?|pptx?|odt|csv|jpe?g|png|gif|webp|svg|ico|mp4|mp3|webm|mov|avi|woff2?|ttf|eot|css|js|json|xml|txt)$/i;
// Links that change state or end a session are never followed, even with GET.
const SKIP_PATH = /(log-?out|sign-?out|deconnexion|d%C3%A9connexion|unsubscribe|desabonnement|delete|supprimer|wp-admin|wp-login|\/cart\/(add|remove)|add-to-cart|\?add-to-cart=)/i;

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PERF_INIT = `(() => {
  const s = (window.__golive = { lcp: 0, cls: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) s.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) s.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  } catch {}
})();`;

/**
 * Visits up to maxPages pages of a site in a real browser, as an anonymous visitor:
 * GET navigation only, no click, no form submission, no consent given.
 * Never throws: failures are reported in the observation.
 */
export async function crawl(startUrl: string, options: CrawlOptions = {}): Promise<CrawlObservation> {
  const maxPages = options.maxPages ?? 20;
  const budgetMs = options.budgetMs ?? 150_000;
  const pageTimeoutMs = options.pageTimeoutMs ?? 20_000;
  const started = Date.now();
  const start = assertUrlAllowed(startUrl, options);
  // The site is the host the start URL lands on (a redirect to a new domain moves the perimeter with it).
  const origin = start.hostname.replace(/^www\./, "");
  let site = origin;
  const under = (host: string, d: string) => host === d || host.endsWith(`.${d}`);
  const firstParty = (host: string) => under(host, site) || under(host, origin);

  const obs: CrawlObservation = {
    browser: "",
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    maxPages,
    truncated: false,
    pages: [],
    brokenLinks: [],
    thirdParties: [],
    cookiesBeforeConsent: [],
    mixedContent: [],
    blockedRequests: 0,
  };

  const proxy = await startGuardProxy(options);
  let browser: Browser | undefined;
  try {
    browser = await launch(options.channel, proxy.url);
    obs.browser = `${browser.browserType().name()} ${browser.version()}`;
    const context = await browser.newContext({
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version().split(".")[0]}.0.0.0 Safari/537.36 ${USER_AGENT}`,
      viewport: { width: 1366, height: 900 },
      locale: "fr-FR",
      serviceWorkers: "block",
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
    });
    await context.addInitScript(PERF_INIT);

    let blockedSchemes = 0;
    await context.route("**/*", (route) => {
      const u = route.request().url();
      if (/^(https?|data|blob):/i.test(u)) return route.continue();
      blockedSchemes++;
      return route.abort("blockedbyclient");
    });

    const third = new Set<string>();
    context.on("request", (req) => {
      try {
        const host = new URL(req.url()).hostname;
        if (host) third.add(host);
      } catch {}
    });

    const queue: { url: string; from: string }[] = [{ url: normalize(start)!, from: "" }];
    const seen = new Set([queue[0]!.url]);

    while (queue.length && obs.pages.length < maxPages && Date.now() - started < budgetMs) {
      const next = queue.shift()!;
      options.onProgress?.({ pages: obs.pages.length, maxPages, url: next.url });
      const { page: result, links, finalHost } = await visit(context, next.url, {
        pageTimeoutMs,
        accessibility: options.accessibility !== false,
        firstParty,
        mixed: obs.mixedContent,
      });
      if (obs.pages.length === 0 && finalHost) site = finalHost.replace(/^www\./, "");
      obs.pages.push(result);
      if (result.status === null || result.status >= 400) obs.brokenLinks.push({ url: next.url, status: result.status, from: next.from });

      if (obs.pages.length === 1) {
        const cookies = await context.cookies();
        obs.cookiesBeforeConsent = cookies.map((c) => ({
          name: c.name,
          domain: c.domain.replace(/^\./, ""),
          thirdParty: !firstParty(c.domain.replace(/^\./, "").replace(/^www\./, "")),
        }));
      }

      for (const link of links) {
        if (seen.has(link)) continue;
        seen.add(link);
        queue.push({ url: link, from: next.url });
      }
    }
    obs.truncated = queue.length > 0;
    obs.thirdParties = [...third].filter((h) => !firstParty(h.replace(/^www\./, ""))).sort();
    obs.blockedRequests = proxy.blocked() + blockedSchemes;
    await context.close();
  } catch (e) {
    obs.pages.push(failedPage(startUrl, `Navigateur indisponible : ${(e as Error).message.split("\n")[0]}`));
  } finally {
    await browser?.close().catch(() => {});
    await proxy.close();
    obs.durationMs = Date.now() - started;
    options.onProgress?.({ pages: obs.pages.length, maxPages, url: "" });
  }
  return obs;
}

async function launch(channel: string | undefined, proxy: string): Promise<Browser> {
  const base = {
    headless: true,
    proxy: { server: proxy },
    // Remove Chromium's implicit proxy bypass for localhost so every request is guarded.
    args: ["--proxy-bypass-list=<-loopback>", "--disable-dev-shm-usage", "--no-first-run"],
  };
  const wanted = channel ?? process.env.GOLIVE_BROWSER_CHANNEL;
  if (wanted) return chromium.launch({ ...base, channel: wanted === "chromium" ? undefined : wanted });
  // Bundled Chromium first (Docker image), then an installed Chrome or Edge.
  let last: unknown;
  for (const c of [undefined, "chrome", "msedge"]) {
    try {
      return await chromium.launch({ ...base, channel: c });
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

interface VisitContext {
  pageTimeoutMs: number;
  accessibility: boolean;
  firstParty: (host: string) => boolean;
  mixed: CrawlObservation["mixedContent"];
}

async function visit(context: BrowserContext, url: string, ctx: VisitContext): Promise<{ page: CrawledPage; links: string[]; finalHost?: string }> {
  const page = await context.newPage();
  let consoleErrors = 0;
  let requests = 0;
  let bytes = 0;
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors++;
  });
  page.on("pageerror", () => consoleErrors++);
  page.on("request", (r) => {
    requests++;
    if (url.startsWith("https:") && r.url().startsWith("http:") && ctx.mixed.length < 50) ctx.mixed.push({ page: url, url: r.url() });
  });
  page.on("response", (r) => {
    const len = Number(r.headers()["content-length"]);
    if (Number.isFinite(len)) bytes += len;
  });

  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: ctx.pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
    const finalUrl = new URL(page.url());
    const info = await readPage(page);
    // Links are judged against the host we actually landed on.
    const landed = finalUrl.hostname.replace(/^www\./, "");
    const sameSite = (h: string) => ctx.firstParty(h) || h === landed || h.endsWith(`.${landed}`);
    const result: CrawledPage = {
      url,
      status: res?.status() ?? null,
      title: info.title || undefined,
      metaDescription: info.description || undefined,
      lang: info.lang || undefined,
      h1: info.h1,
      canonical: info.canonical || undefined,
      noindex: /noindex/i.test(info.robots ?? "") || /noindex/i.test(res?.headers()["x-robots-tag"] ?? ""),
      timing: info.timing,
      bytes,
      requests,
      consoleErrors,
    };
    if (ctx.accessibility && result.status !== null && result.status < 400) result.axe = await runAxe(page);
    const links = info.links
      .map((h) => {
        try {
          return new URL(h, finalUrl);
        } catch {
          return undefined;
        }
      })
      .filter((u): u is URL => !!u && sameSite(u.hostname.replace(/^www\./, "")))
      .map(normalize)
      .filter((u): u is string => !!u);
    return { page: result, links: [...new Set(links)], finalHost: finalUrl.hostname };
  } catch (e) {
    return { page: { ...failedPage(url, (e as Error).message.split("\n")[0]!), consoleErrors, requests, bytes }, links: [] };
  } finally {
    await page.close().catch(() => {});
  }
}

interface PageInfo {
  title: string;
  description: string;
  robots: string;
  lang: string;
  h1: number;
  canonical: string;
  links: string[];
  timing: CrawledPage["timing"];
}

// Sent as plain source: transpilers may inject helpers into functions, which do not exist in the page.
const READ_PAGE = `(() => {
  const meta = (n) => document.querySelector('meta[name="' + n + '" i]')?.content ?? "";
  const nav = performance.getEntriesByType("navigation")[0];
  const s = window.__golive;
  const round = (n) => (n && n > 0 ? Math.round(n) : undefined);
  return {
    title: document.title.trim(),
    description: meta("description").trim(),
    robots: meta("robots"),
    lang: document.documentElement.lang,
    h1: document.querySelectorAll("h1").length,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
    links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "").slice(0, 500),
    timing: {
      ttfbMs: round(nav?.responseStart),
      domContentLoadedMs: round(nav?.domContentLoadedEventEnd),
      loadMs: round(nav?.loadEventEnd),
      lcpMs: round(s?.lcp),
      cls: s ? Math.round(s.cls * 1000) / 1000 : undefined,
    },
  };
})()`;

async function readPage(page: Page): Promise<PageInfo> {
  return page.evaluate(READ_PAGE) as Promise<PageInfo>;
}

async function runAxe(page: Page): Promise<CrawledPage["axe"]> {
  try {
    const r = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const violations: AxeViolation[] = r.violations.map((v) => ({
      id: v.id,
      impact: (v.impact ?? null) as AxeViolation["impact"],
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags.filter((t) => /^wcag\d/.test(t)),
      nodes: v.nodes.length,
    }));
    return { violations, passes: r.passes.length, incomplete: r.incomplete.length };
  } catch {
    return undefined;
  }
}

/** Canonical form used to deduplicate pages: no hash, no tracking parameters, skipped file types. */
export function normalize(u: URL): string | undefined {
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname + u.search)) return undefined;
  const out = new URL(u.toString());
  out.hash = "";
  for (const k of [...out.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) out.searchParams.delete(k);
  return out.toString();
}

function failedPage(url: string, error: string): CrawledPage {
  return { url, status: null, error, h1: 0, noindex: false, timing: {}, bytes: 0, requests: 0, consoleErrors: 0 };
}
