/**
 * Layer 3 input: a passive observation of a deployed site.
 * Produced by @golive/probe (or any compatible tool) and consumed by rules.
 */
export interface WebObservation {
  url: string;
  /** Which declared target was audited. Production and pre-production expect opposite indexing rules. */
  env: "prod" | "preprod";
  finalUrl: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  status?: number;
  /** Does plain http:// redirect to https://? "closed" when port 80 does not answer, null when not tested. */
  httpsRedirect: boolean | "closed" | null;
  /** Response headers, lower-cased names. */
  headers: Record<string, string>;
  setCookies: ParsedCookie[];
  tls?: {
    authorized: boolean;
    authError?: string;
    protocol?: string;
    issuer?: string;
    validTo: string;
    daysLeft: number;
  };
  html?: {
    lang?: string;
    title?: string;
    metaDescription?: string;
    robots?: string;
    /** Content of <meta name="viewport">, if any. */
    viewport?: string;
    generator?: string;
    links: { href: string; text: string }[];
    scripts: string[];
    iframes: string[];
    images: number;
    imagesWithoutAlt: number;
    forms: number;
    passwordFieldsOverHttp: number;
  };
  /** Well-known files probed with a single GET each (robots.txt, security.txt). */
  wellKnown: { robotsTxt: boolean; securityTxt: boolean; sitemap: boolean };
  /** Sensitive files found publicly readable (.git, .env, SQL dumps…). Undefined when not checked. */
  exposedFiles?: ExposedFile[];
  /** IP address the site answered from, and the network it is registered to (RDAP). */
  network?: { ip: string; country?: string; name?: string; registry?: string };
  /** CDN or edge provider recognised from the response headers; null when none (undefined: not checked). */
  edge?: string | null;
  timing: { ttfbMs: number; totalMs: number };
  bytes: number;
  /** Multi-page crawl in a real browser (full audit only). */
  crawl?: CrawlObservation;
}

/** What the audit robot saw while browsing the site like a visitor, without interacting. */
export interface CrawlObservation {
  browser: string;
  startedAt: string;
  durationMs: number;
  maxPages: number;
  /** More same-site pages were found than the budget allowed. */
  truncated: boolean;
  pages: CrawledPage[];
  /** Same-site links answering 4xx or 5xx, with the page that links to them. */
  brokenLinks: { url: string; status: number | null; from: string }[];
  /** Hosts outside the site contacted while loading pages. */
  thirdParties: string[];
  /** Cookies present after loading the first page, before any click. */
  cookiesBeforeConsent: { name: string; domain: string; thirdParty: boolean }[];
  /** http:// resources requested by https:// pages. */
  mixedContent: { page: string; url: string }[];
  /** Requests refused by the robot (private addresses, unsupported schemes). */
  blockedRequests: number;
  /** Lighthouse run on the first page (mobile profile). */
  lighthouse?: LighthouseResult;
}

export interface LighthouseResult {
  url: string;
  version?: string;
  formFactor?: string;
  /** 0 to 100, null when Lighthouse could not score the category. */
  scores?: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  metrics?: { fcpMs?: number; lcpMs?: number; tbtMs?: number; cls?: number; speedIndexMs?: number };
  runtimeError?: string;
  error?: string;
  durationMs: number;
}

export interface CrawledPage {
  url: string;
  status: number | null;
  error?: string;
  title?: string;
  metaDescription?: string;
  lang?: string;
  h1: number;
  canonical?: string;
  noindex: boolean;
  timing: { ttfbMs?: number; domContentLoadedMs?: number; loadMs?: number; lcpMs?: number; cls?: number };
  bytes: number;
  requests: number;
  consoleErrors: number;
  axe?: { violations: AxeViolation[]; passes: number; incomplete: number };
}

export interface AxeViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: number;
}

export interface ParsedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}

export interface ExposedFile {
  path: string;
  kind: "git" | "vcs" | "env" | "dump" | "credentials" | "config" | "debug" | "listing";
  status: number;
}
