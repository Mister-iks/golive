import { describe, expect, it } from "vitest";
import { extractHtml, isBlockedIp, probe } from "../src";

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "41.82.1.1", "2a00:1450:4007::1"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));

  it("refuses internal targets without network access", async () => {
    for (const url of ["http://127.0.0.1/", "http://localhost:3000", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd"]) {
      const obs = await probe(url);
      expect(obs.ok, url).toBe(false);
      expect(obs.error).toBeTruthy();
    }
  });
});

describe("HTML extraction", () => {
  const html = `<!doctype html><html lang="fr"><head>
    <title> Accueil </title>
    <meta name="description" content="Desc">
    <meta name="viewport" content="width=device-width, user-scalable=no">
    <meta name="generator" content="WordPress 6.4.2">
    <script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
    <script type="text/plain" data-consent src="https://connect.facebook.net/fbevents.js"></script>
  </head><body>
    <a href="/mentions-legales">Mentions légales</a>
    <img src="a.png"><img src="b.png" alt="">
    <form action="http://example.com/login"><input type="password"></form>
  </body></html>`;
  const out = extractHtml(html, new URL("https://example.com/"));

  it("reads page metadata", () => {
    expect(out.lang).toBe("fr");
    expect(out.title).toBe("Accueil");
    expect(out.metaDescription).toBe("Desc");
    expect(out.generator).toBe("WordPress 6.4.2");
  });
  it("only counts executable scripts (consent-blocked ones are ignored)", () => {
    expect(out.scripts).toEqual(["https://www.googletagmanager.com/gtag/js?id=G-1"]);
  });
  it("resolves links and counts images without alt", () => {
    expect(out.links[0]).toEqual({ href: "https://example.com/mentions-legales", text: "Mentions légales" });
    expect(out.imagesWithoutAlt).toBe(1);
  });
  it("detects password forms posting over http", () => {
    expect(out.passwordFieldsOverHttp).toBe(1);
  });
});
