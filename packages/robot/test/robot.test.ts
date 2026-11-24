import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawl, normalize, startGuardProxy } from "../src";

const PAGES: Record<string, string> = {
  "/": `<!doctype html><html lang="fr"><head><title>Accueil</title><meta name="description" content="Site de test"></head>
    <body><h1>Accueil</h1><a href="/a">A</a> <a href="/b#x">B</a> <a href="/missing">Lien cassé</a>
    <a href="/logout">Déconnexion</a> <a href="/doc.pdf">PDF</a> <a href="https://ailleurs.example/">Externe</a>
    <img src="/i.png"></body></html>`,
  "/a": `<!doctype html><html lang="fr"><head><title>Page A</title></head><body><h1>A</h1><a href="/">Accueil</a><a href="/b?utm_source=x">B</a></body></html>`,
  "/b": `<!doctype html><html><head><title>Page B</title></head><body><p>Sans h1 ni lang</p></body></html>`,
};

let server: Server;
let base = "";
let browserAvailable = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/logout") throw new Error("the robot must never follow a logout link");
    const html = PAGES[path];
    if (path === "/i.png") return res.writeHead(200, { "content-type": "image/png" }).end();
    if (!html) return res.writeHead(404, { "content-type": "text/html" }).end("<h1>404</h1>");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "sid=1; Path=/" }).end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const channel of [undefined, "chrome", "msedge"]) {
    try {
      const b = await chromium.launch({ channel });
      await b.close();
      browserAvailable = true;
      break;
    } catch {}
  }
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("normalize", () => {
  it("drops hashes, tracking parameters, files and state-changing links", () => {
    expect(normalize(new URL("https://s.sn/a?utm_source=x&id=2#top"))).toBe("https://s.sn/a?id=2");
    expect(normalize(new URL("https://s.sn/rapport.pdf"))).toBeUndefined();
    expect(normalize(new URL("https://s.sn/logout"))).toBeUndefined();
    expect(normalize(new URL("mailto:a@b.sn"))).toBeUndefined();
  });
});

describe("guard proxy", () => {
  it("refuses private addresses resolved at connect time", async () => {
    const proxy = await startGuardProxy({ allowPrivate: false });
    const res = await fetch(proxy.url, { method: "GET", headers: {} }).catch(() => undefined);
    expect(res?.status).toBe(400);
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve) => {
      const port = new URL(base).port;
      const req = request({ host: "127.0.0.1", port: new URL(proxy.url).port, method: "GET", path: `http://localhost:${port}/` }, (r) => resolve(r.statusCode ?? 0));
      req.on("error", () => resolve(0));
      req.end();
    });
    expect(status).toBe(502);
    expect(proxy.blocked()).toBe(1);
    await proxy.close();
  });
});

describe("crawl", () => {
  it("refuses private targets by default", async () => {
    await expect(crawl(base)).rejects.toThrow(/refusée/);
  });

  it("visits same-site pages passively and reports what it saw", async (t) => {
    if (!browserAvailable) t.skip();
    const obs = await crawl(base + "/", { allowPrivate: true, maxPages: 10, budgetMs: 60_000 });
    const urls = obs.pages.map((p) => new URL(p.url).pathname).sort();
    expect(urls).toEqual(["/", "/a", "/b", "/missing"]);
    expect(obs.brokenLinks).toEqual([{ url: `${base}/missing`, status: 404, from: `${base}/` }]);
    const b = obs.pages.find((p) => p.url.endsWith("/b"))!;
    expect(b.h1).toBe(0);
    expect(b.axe?.violations.map((v) => v.id)).toContain("html-has-lang");
    const home = obs.pages.find((p) => p.url === `${base}/`)!;
    expect(home.axe?.violations.map((v) => v.id)).toContain("image-alt");
    expect(obs.cookiesBeforeConsent).toEqual([{ name: "sid", domain: "127.0.0.1", thirdParty: false }]);
    expect(obs.truncated).toBe(false);
  }, 90_000);
});
