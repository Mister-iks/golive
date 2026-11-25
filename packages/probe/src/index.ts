import { connect as tlsConnect } from "node:tls";
import { parse, type HTMLElement } from "node-html-parser";
import { Agent, fetch, type Response } from "undici";
import type { ParsedCookie, WebObservation } from "@golive/packs-sdk";
import { assertUrlAllowed, guardedLookup, type GuardOptions } from "./guard";

export { assertUrlAllowed, BlockedAddressError, isBlockedIp, type GuardOptions } from "./guard";

import { USER_AGENT } from "./ua";
import { checkExposedFiles, detectEdge, lookupNetwork } from "./network";

export { USER_AGENT } from "./ua";
export { detectEdge, lookupNetwork } from "./network";
export { SENSITIVE_PATHS } from "./exposure";

export interface ProbeOptions extends GuardOptions {
  env?: "prod" | "preprod";
  /** Look for sensitive files left public (.git, .env, SQL dumps…). Default true. */
  exposedFiles?: boolean;
  /** Ask the public RDAP registries who the answering IP belongs to. Default true. */
  network?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/**
 * Passive observation of a URL: a handful of GET requests, no form submission,
 * no crawling beyond well-known files, no exploitation. Never throws.
 */
export async function probe(rawUrl: string, options: ProbeOptions = {}): Promise<WebObservation> {
  const env = options.env ?? "prod";
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? 3_000_000;
  const started = Date.now();
  const fetchedAt = new Date().toISOString();

  const empty: WebObservation = {
    url: rawUrl,
    env,
    finalUrl: rawUrl,
    fetchedAt,
    ok: false,
    httpsRedirect: null,
    headers: {},
    setCookies: [],
    wellKnown: { robotsTxt: false, securityTxt: false, sitemap: false },
    timing: { ttfbMs: 0, totalMs: 0 },
    bytes: 0,
  };

  let url: URL;
  try {
    url = assertUrlAllowed(rawUrl, options);
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }

  const lookup = guardedLookup(options);
  const agent = new Agent({ connect: { lookup: lookup as never, timeout: timeoutMs }, headersTimeout: timeoutMs, bodyTimeout: timeoutMs });

  try {
    const page = await follow(url, agent, options, timeoutMs);
    const ttfbMs = Date.now() - started;
    const { text, bytes } = await readCapped(page.res, maxBytes);
    const pageMs = Date.now() - started;
    const headers: Record<string, string> = {};
    page.res.headers.forEach((v, k) => {
      if (k !== "set-cookie") headers[k] = v;
    });
    const setCookies = page.res.headers.getSetCookie().map(parseCookie);
    const finalUrl = page.url.toString();

    const isHtml = /html/i.test(headers["content-type"] ?? "") || /^\s*<!doctype html|<html/i.test(text.slice(0, 500));
    const html = isHtml ? extractHtml(text, page.url) : undefined;

    const [tls, httpsRedirect, wellKnown, exposedFiles, network] = await Promise.all([
      page.url.protocol === "https:" ? readTls(page.url, options, timeoutMs) : Promise.resolve(undefined),
      checkHttpRedirect(page.url, agent, Math.min(timeoutMs, 5_000)),
      checkWellKnown(page.url, agent, timeoutMs),
      options.exposedFiles === false ? Promise.resolve(undefined) : checkExposedFiles(page.url.origin, agent, Math.min(timeoutMs, 6_000)),
      options.network === false ? Promise.resolve(undefined) : lookupNetwork(page.url.hostname).catch(() => undefined),
    ]);

    return {
      ...empty,
      finalUrl,
      ok: true,
      status: page.res.status,
      httpsRedirect,
      headers,
      setCookies,
      tls,
      html,
      wellKnown,
      exposedFiles,
      network,
      edge: detectEdge(headers) ?? null,
      timing: { ttfbMs, totalMs: pageMs },
      bytes,
    };
  } catch (e) {
    return { ...empty, error: describeError(e), timing: { ttfbMs: 0, totalMs: Date.now() - started } };
  } finally {
    await agent.close().catch(() => {});
  }
}

async function follow(start: URL, agent: Agent, opts: ProbeOptions, timeoutMs: number) {
  let url = start;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      dispatcher: agent,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      url = assertUrlAllowed(new URL(location, url).toString(), opts);
      continue;
    }
    return { res, url };
  }
  throw new Error("Too many redirects.");
}

async function readCapped(res: Response, max: number) {
  if (!res.body) return { text: "", bytes: 0 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    if (bytes > max) break;
    chunks.push(chunk);
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), bytes };
}

function parseCookie(raw: string): ParsedCookie {
  const [pair = "", ...attrs] = raw.split(";");
  const lower = attrs.map((a) => a.trim().toLowerCase());
  const sameSite = lower.find((a) => a.startsWith("samesite="))?.split("=")[1];
  return {
    name: pair.split("=")[0]?.trim() ?? "",
    secure: lower.includes("secure"),
    httpOnly: lower.includes("httponly"),
    sameSite,
  };
}

const EXECUTABLE_SCRIPT = /^(|text\/javascript|application\/javascript|module)$/i;

export function extractHtml(source: string, base: URL): NonNullable<WebObservation["html"]> {
  const root = parse(source, { comment: false, blockTextElements: { script: false, style: false, noscript: false } });
  const meta = (name: string) =>
    root.querySelector(`meta[name="${name}" i]`)?.getAttribute("content") ??
    root.querySelectorAll("meta").find((m) => m.getAttribute("name")?.toLowerCase() === name)?.getAttribute("content");

  const abs = (href: string) => {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  };

  const links = root
    .querySelectorAll("a[href]")
    .slice(0, 800)
    .map((a: HTMLElement) => ({ href: abs(a.getAttribute("href") ?? ""), text: a.text.replace(/\s+/g, " ").trim().slice(0, 120) }));

  const scripts = root
    .querySelectorAll("script[src]")
    .filter((s) => EXECUTABLE_SCRIPT.test((s.getAttribute("type") ?? "").trim()))
    .map((s) => abs(s.getAttribute("src") ?? ""));

  const images = root.querySelectorAll("img");
  const isHttp = base.protocol === "http:";
  const forms = root.querySelectorAll("form");
  const passwordFieldsOverHttp = forms.filter((f) => {
    if (!f.querySelector('input[type="password" i]')) return false;
    const action = f.getAttribute("action");
    const target = action ? abs(action) : base.toString();
    return isHttp || target.startsWith("http://");
  }).length;

  return {
    lang: root.querySelector("html")?.getAttribute("lang") || undefined,
    title: root.querySelector("title")?.text.trim() || undefined,
    metaDescription: meta("description") || undefined,
    robots: meta("robots") || undefined,
    viewport: meta("viewport") || undefined,
    generator: meta("generator") || undefined,
    links,
    scripts,
    iframes: root.querySelectorAll("iframe[src]").map((f) => abs(f.getAttribute("src") ?? "")),
    images: images.length,
    imagesWithoutAlt: images.filter((i) => i.getAttribute("alt") === undefined).length,
    forms: forms.length,
    passwordFieldsOverHttp,
  };
}

function readTls(url: URL, opts: GuardOptions, timeoutMs: number): Promise<WebObservation["tls"]> {
  return new Promise((resolve) => {
    const socket = tlsConnect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: url.hostname,
      rejectUnauthorized: false,
      lookup: guardedLookup(opts) as never,
      timeout: timeoutMs,
    });
    const done = (v: WebObservation["tls"]) => {
      socket.destroy();
      resolve(v);
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) return done(undefined);
      const validTo = new Date(cert.valid_to).toISOString();
      const issuer = [cert.issuer?.O, cert.issuer?.CN].flat().filter(Boolean)[0] as string | undefined;
      done({
        authorized: socket.authorized,
        authError: socket.authorizationError ? String(socket.authorizationError) : undefined,
        protocol: socket.getProtocol() ?? undefined,
        issuer,
        validTo,
        daysLeft: Math.floor((Date.parse(validTo) - Date.now()) / 86_400_000),
      });
    });
    socket.once("error", () => done(undefined));
    socket.once("timeout", () => done(undefined));
  });
}

async function checkHttpRedirect(url: URL, agent: Agent, timeoutMs: number): Promise<boolean | "closed" | null> {
  if (url.protocol === "http:") return false;
  try {
    const plain = new URL(url.toString());
    plain.protocol = "http:";
    plain.port = "";
    plain.pathname = "/";
    const res = await fetch(plain, {
      redirect: "manual",
      dispatcher: agent,
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get("location") ?? "";
    return res.status >= 300 && res.status < 400 && new URL(loc, plain).protocol === "https:";
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    if (code === "ECONNREFUSED" || code === "UND_ERR_CONNECT_TIMEOUT" || (e as Error).name === "TimeoutError") return "closed";
    return null;
  }
}

async function checkWellKnown(url: URL, agent: Agent, timeoutMs: number): Promise<WebObservation["wellKnown"]> {
  const get = async (path: string) => {
    try {
      const res = await fetch(new URL(path, url.origin), {
        redirect: "manual",
        dispatcher: agent,
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const ok = res.status === 200;
      const text = ok ? (await res.text()).slice(0, 20_000) : "";
      if (!ok) await res.body?.cancel().catch(() => {});
      return { ok, text };
    } catch {
      return { ok: false, text: "" };
    }
  };
  const [robots, security] = await Promise.all([get("/robots.txt"), get("/.well-known/security.txt")]);
  let sitemap = /^sitemap:/im.test(robots.text);
  if (!sitemap) sitemap = (await get("/sitemap.xml")).ok;
  return {
    robotsTxt: robots.ok && !/<html/i.test(robots.text),
    securityTxt: security.ok && /contact:/i.test(security.text),
    sitemap,
  };
}

function describeError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string; name?: string } };
  if (err.name === "BlockedAddressError") return err.message;
  if (err.cause?.name === "BlockedAddressError" || /Address refused/.test(err.cause?.message ?? "")) return err.cause!.message!;
  const code = err.cause?.code;
  if (code === "ENOTFOUND") return "Domain name not found (DNS).";
  if (code === "ECONNREFUSED") return "Connection refused by the server.";
  if (err.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT") return "The server did not answer in time.";
  return err.cause?.message ?? err.message;
}
