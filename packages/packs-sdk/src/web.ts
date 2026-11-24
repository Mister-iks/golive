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
  timing: { ttfbMs: number; totalMs: number };
  bytes: number;
}

export interface ParsedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}
