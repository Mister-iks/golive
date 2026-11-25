import { describe, expect, it } from "vitest";
import { TEMPLATES, parseSpec, stringifySpec, validateSpec, type Spec } from "@golive/spec";
import { COMMUNITY_PACKS, evaluate, suggestProfiles, type RepoObservation } from "../src";

function scan(partial: Partial<RepoObservation> = {}): RepoObservation {
  return {
    root: ".",
    scannedAt: "2026-11-24T10:00:00.000Z",
    files: 120,
    tools: [{ name: "golive-secrets", used: true }],
    secrets: [],
    dependencies: { checked: true, manifests: [{ file: "package-lock.json", ecosystem: "npm", packages: 200, lockfile: true }], vulnerabilities: [] },
    containerFiles: [],
    containers: [],
    ...partial,
  };
}

const AS_OF = "2026-11-24";

function load(id: string): Spec {
  const t = TEMPLATES.find((x) => x.id === id);
  const r = validateSpec(t!.spec);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
}

function result(spec: Spec, ruleId: string) {
  return evaluate(spec, { asOf: AS_OF }).results.find((r) => r.ruleId === ruleId);
}

describe("GoLive Spec", () => {
  it.each(TEMPLATES.map((t) => [t.id]))("template %s is valid", (id) => {
    expect(validateSpec(TEMPLATES.find((t) => t.id === id)!.spec).ok).toBe(true);
  });

  it("round-trips through YAML without loss", () => {
    for (const t of TEMPLATES) {
      const spec = load(t.id);
      const yaml = stringifySpec(spec);
      const back = parseSpec(yaml);
      expect(back.ok, yaml).toBe(true);
      expect(back.spec).toEqual(spec);
    }
  });

  it("reports the line of an invalid value", () => {
    const r = parseSpec("spec: golive/v1\nproject:\n  name: X\ncomponents:\n  - id: db\n    kind: databse\n");
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.line).toBe(6);
  });

  it("rejects links to unknown elements", () => {
    const r = parseSpec("spec: golive/v1\nproject: { name: X }\nlinks:\n  - { from: a, to: b }\n");
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.message).join()).toMatch(/unknown/);
  });
});

describe("engine", () => {
  it("a database exposed to the Internet is a blocker and gives No-Go", () => {
    const spec = load("mobile-api");
    const r = result(spec, "core.arch.datastore-private")!;
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("blocker");
    expect(r.blocking).toBe(true);
    expect(evaluate(spec, { asOf: AS_OF }).verdict.decision).toBe("no-go");
  });

  it("is deterministic: same input, same report", () => {
    const spec = load("saas-b2b");
    const a = evaluate(spec, { asOf: AS_OF });
    const b = evaluate(structuredClone(spec), { asOf: AS_OF });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("ignores Studio layout in the fingerprint", () => {
    const spec = load("saas-b2b");
    const moved = { ...spec, layout: { ...spec.layout, api: [9999, 9999] as [number, number] } };
    expect(evaluate(moved, { asOf: AS_OF }).fingerprint).toBe(evaluate(spec, { asOf: AS_OF }).fingerprint);
  });

  it("flags plaintext links carrying personal data as blockers", () => {
    const r = result(load("wordpress-showcase"), "core.arch.encrypted-links")!;
    expect(r.status).toBe("fail");
    expect(r.findings[0]?.severity).toBe("blocker");
  });

  it("detects end-of-life technologies relative to asOf", () => {
    const r = result(load("wordpress-showcase"), "core.tech.eol")!;
    expect(r.findings.some((f) => f.observed === "php@8.1" && f.status === "fail")).toBe(true);
  });

  it("selects country packs from declared countries", () => {
    const ids = evaluate(load("ecommerce"), { asOf: AS_OF }).packs.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["golive-core", "sn-cdp", "eu-gdpr", "payment"]));
  });

  it("evidence attestation turns a required proof into a pass", () => {
    const spec = load("public-service");
    expect(result(spec, "sn.cdp.declaration")!.status).toBe("evidence");
    const attested = { ...spec, evidence: { "sn.cdp.declaration": { by: "A. Diop", date: "2026-11-01" } } };
    const r = result(attested, "sn.cdp.declaration")!;
    expect(r.status).toBe("pass");
    expect(r.attested?.by).toBe("A. Diop");
  });

  it("a valid waiver covers a blocker and an expired one does not", () => {
    const spec = load("public-service");
    const r0 = evaluate(spec, { asOf: AS_OF });
    const blockers = r0.results.filter((r) => r.blocking).map((r) => r.ruleId);
    expect(blockers.length).toBeGreaterThan(0);

    const waive = (expires: string) => ({
      ...spec,
      waivers: blockers.map((rule) => ({ rule, reason: "Pilote", owner: "DSI", expires })),
    });
    const ok = evaluate(waive("2027-01-31"), { asOf: AS_OF });
    expect(ok.results.filter((r) => r.blocking)).toHaveLength(0);
    expect(ok.counts.waived).toBe(blockers.length);

    const expired = evaluate(waive("2026-01-01"), { asOf: AS_OF });
    expect(expired.verdict.decision).toBe("no-go");
  });

  it("automatic layer 3 rules are not-run without an audit and excluded from the score", () => {
    const report = evaluate(load("saas-b2b"), { asOf: AS_OF });
    const web = report.results.filter((r) => r.layer === 3 && r.method === "auto" && r.status !== "na");
    expect(web.every((r) => r.status === "not-run")).toBe(true);
    expect(report.coverage.layers).not.toContain(3);
  });

  it("every community rule has a source, a fix and a unique id", () => {
    const ids = new Set<string>();
    for (const pack of COMMUNITY_PACKS) {
      for (const rule of pack.rules) {
        expect(ids.has(rule.id), rule.id).toBe(false);
        ids.add(rule.id);
        expect(rule.source.label.length, rule.id).toBeGreaterThan(3);
        expect(rule.fix.length, rule.id).toBeGreaterThan(10);
      }
    }
  });

  it("legal packs without a review date are flagged as stale", () => {
    const report = evaluate(load("public-service"), { asOf: AS_OF });
    expect(report.packs.find((p) => p.id === "sn-cdp")?.stale).toBe(true);
  });

  describe("layer 2", () => {
    it("a secret committed to the repository is a blocker and gives No-Go", () => {
      const repo = scan({ secrets: [{ file: "src/config.ts", line: 3, rule: "aws-access-key", description: "Clé d'accès AWS" }] });
      const report = evaluate(load("saas-b2b"), { asOf: AS_OF, repo });
      const r = report.results.find((x) => x.ruleId === "sec.code.secrets")!;
      expect(r.status).toBe("fail");
      expect(r.blocking).toBe(true);
      expect(report.verdict.decision).toBe("no-go");
      expect(report.coverage.layers).toContain(2);
    });

    it("maps vulnerability severity to finding severity", () => {
      const repo = scan({
        dependencies: {
          checked: true,
          manifests: [{ file: "package-lock.json", ecosystem: "npm", packages: 10, lockfile: true }],
          vulnerabilities: [
            { id: "GHSA-1", aliases: ["CVE-2026-1"], package: "a", version: "1.0.0", ecosystem: "npm", severity: "critical", summary: "RCE", fixed: "1.0.1", file: "package-lock.json" },
            { id: "GHSA-2", aliases: [], package: "b", version: "2.0.0", ecosystem: "npm", severity: "medium", summary: "", file: "package-lock.json" },
          ],
        },
      });
      const r = evaluate(load("saas-b2b"), { asOf: AS_OF, repo }).results.find((x) => x.ruleId === "sec.app.dependency-scan")!;
      expect(r.findings.map((f) => f.severity)).toEqual(["blocker", "minor"]);
      expect(r.findings[0]?.message).toContain("CVE-2026-1");
      expect(r.blocking).toBe(true);
    });

    it("flags a datastore published by compose while the architecture declares it private", () => {
      const repo = scan({
        containerFiles: ["docker-compose.yml"],
        containers: [{ file: "docker-compose.yml", check: "published-datastore", message: "Le service db publie le port 5432.", subject: "db" }],
      });
      const r = evaluate(load("saas-b2b"), { asOf: AS_OF, repo }).results.find((x) => x.ruleId === "core.drift.published-datastore")!;
      expect(r.status).toBe("fail");
      expect(r.findings[0]?.message).toContain("declares it private");
    });

    it("layer 2 rules are not-run without a scan, and dependency scanning asks for proof", () => {
      const report = evaluate(load("saas-b2b"), { asOf: AS_OF });
      expect(report.results.find((x) => x.ruleId === "sec.code.secrets")?.status).toBe("not-run");
      expect(report.results.find((x) => x.ruleId === "sec.app.dependency-scan")?.status).toBe("evidence");
      expect(report.coverage.layers).not.toContain(2);
    });
  });
});

describe("layer 3, full audit", () => {
  const base = {
    url: "https://boutique.example.sn",
    env: "prod" as const,
    finalUrl: "https://boutique.example.sn/",
    fetchedAt: "2026-11-24T10:00:00.000Z",
    ok: true,
    status: 200,
    httpsRedirect: true as const,
    headers: {},
    setCookies: [],
    wellKnown: { robotsTxt: true, securityTxt: false, sitemap: true },
    timing: { ttfbMs: 200, totalMs: 400 },
    bytes: 1000,
  };
  const page = (path: string, extra: object = {}) => ({
    url: `https://boutique.example.sn${path}`,
    status: 200,
    title: `Titre ${path}`,
    metaDescription: "d",
    h1: 1,
    noindex: false,
    timing: { lcpMs: 1800, cls: 0.02 },
    bytes: 0,
    requests: 10,
    consoleErrors: 0,
    axe: { violations: [], passes: 40, incomplete: 0 },
    ...extra,
  });
  const crawl = (extra: object = {}) => ({
    browser: "chromium 159",
    startedAt: "2026-11-24T10:00:00.000Z",
    durationMs: 9000,
    maxPages: 20,
    truncated: false,
    pages: [page("/"), page("/produits")],
    brokenLinks: [],
    thirdParties: [],
    cookiesBeforeConsent: [],
    mixedContent: [],
    blockedRequests: 0,
    ...extra,
  });
  const spec = load("ecommerce");
  const withA11y = { ...spec, profiles: [...new Set([...suggestProfiles(spec), "accessibility"])] };
  const run = (c: object | undefined, id: string) => {
    const r = evaluate(withA11y, { asOf: AS_OF, web: { ...base, crawl: c as never } }).results.find((x) => x.ruleId === id);
    if (!r) throw new Error(`rule ${id} not evaluated`);
    return r;
  };

  it("does not run crawl rules after a quick audit", () => {
    expect(run(undefined, "core.web.broken-links").status).toBe("not-run");
    expect(run(undefined, "a11y.axe").status).toBe("not-run");
  });

  it("passes on a clean crawl", () => {
    for (const id of ["core.web.broken-links", "core.web.vitals", "sec.web.mixed-content", "a11y.axe", "core.web.pages-metadata"]) {
      expect([id, run(crawl(), id).status]).toEqual([id, "pass"]);
    }
  });

  it("reports broken links, slow pages, mixed content and accessibility violations", () => {
    const c = crawl({
      pages: [
        page("/", { timing: { lcpMs: 5200, cls: 0.3 }, axe: { violations: [{ id: "color-contrast", impact: "serious", help: "Contraste suffisant", helpUrl: "u", tags: [], nodes: 7 }], passes: 1, incomplete: 0 } }),
        page("/panier", { timing: { lcpMs: 4800 } }),
      ],
      brokenLinks: [{ url: "https://boutique.example.sn/cgv", status: 404, from: "https://boutique.example.sn/" }],
      mixedContent: [{ page: "https://boutique.example.sn/", url: "http://cdn.example.sn/a.js" }],
      thirdParties: ["connect.facebook.net"],
    });
    expect(run(c, "core.web.broken-links").status).toBe("fail");
    expect(run(c, "core.web.vitals").status).toBe("fail");
    expect(run(c, "sec.web.mixed-content").status).toBe("fail");
    const axe = run(c, "a11y.axe");
    expect(axe.status).toBe("fail");
    expect(JSON.stringify(axe)).toContain("7 elements on 1 page");
    expect(run(c, "eu.cookies.consent").status).toBe("fail");
  });
});

describe("languages", () => {
  it("translates texts without changing the outcome", () => {
    const spec = load("mobile-api");
    const en = evaluate(spec, { asOf: AS_OF });
    const fr = evaluate(spec, { asOf: AS_OF, lang: "fr" });
    expect(en.lang).toBe("en");
    expect(fr.lang).toBe("fr");
    expect(fr.fingerprint).toBe(en.fingerprint);
    expect(fr.verdict.decision).toBe(en.verdict.decision);
    expect(fr.score).toEqual(en.score);
    expect(fr.results.map((r) => [r.ruleId, r.status, r.severity])).toEqual(en.results.map((r) => [r.ruleId, r.status, r.severity]));
    const backup = (r: typeof en) => r.results.find((x) => x.ruleId === "core.arch.backup")!;
    expect(backup(en).title).not.toBe(backup(fr).title);
    expect(fr.verdict.reasons[0]).toMatch(/bloquant/);
    expect(en.verdict.reasons[0]).toMatch(/blocking/);
  });

  it("has a French translation for every community rule", () => {
    const missing = COMMUNITY_PACKS.flatMap((p) => [...(p.fr?.name ? [] : [`pack ${p.id}`]), ...p.rules.filter((r) => !r.fr?.title || !r.fr?.why || !r.fr?.fix).map((r) => r.id)]);
    expect(missing).toEqual([]);
  });
});

describe("exposed files and declared versus observed", () => {
  const web = (extra: object = {}) =>
    ({
      url: "https://shop.example.sn",
      env: "prod",
      finalUrl: "https://shop.example.sn/",
      fetchedAt: "2026-11-25T10:00:00.000Z",
      ok: true,
      status: 200,
      httpsRedirect: true,
      headers: {},
      setCookies: [],
      wellKnown: { robotsTxt: true, securityTxt: true, sitemap: true },
      timing: { ttfbMs: 100, totalMs: 200 },
      bytes: 1000,
      exposedFiles: [],
      edge: null,
      ...extra,
    }) as never;
  const spec = load("ecommerce");
  const run = (s: Spec, w: object, id: string) => evaluate(s, { asOf: AS_OF, web: web(w) }).results.find((r) => r.ruleId === id)!;

  it("blocks the Go when a .env file is readable", () => {
    const r = run(spec, { exposedFiles: [{ path: "/.env", kind: "env", status: 200 }, { path: "/.DS_Store", kind: "listing", status: 200 }] }, "sec.web.exposed-files");
    expect(r.status).toBe("fail");
    expect(r.blocking).toBe(true);
    expect(r.findings.map((f) => f.severity)).toEqual(["blocker", "minor"]);
    expect(run(spec, {}, "sec.web.exposed-files").status).toBe("pass");
  });

  it("flags a declared CDN the traffic does not go through", () => {
    const bare: Spec = { ...spec, components: spec.components.filter((c) => c.kind !== "cdn" && c.kind !== "waf") };
    const withCdn: Spec = { ...bare, components: [...bare.components, { id: "edge", kind: "cdn", tech: "cloudflare" } as never] };
    expect(run(withCdn, { edge: null }, "core.drift.cdn").status).toBe("fail");
    expect(run(withCdn, { edge: undefined }, "core.drift.cdn").status).toBe("not-run");
    expect(run(withCdn, { edge: "cloudflare" }, "core.drift.cdn").status).toBe("pass");
    expect(run(bare, { edge: "cloudflare" }, "core.drift.cdn").status).toBe("warn");
  });

  it("compares the declared hosting country with the network registry", () => {
    const front = new Set(["frontend", "load-balancer", "api"]);
    const sn: Spec = { ...spec, components: spec.components.map((c) => (front.has(c.kind) ? { ...c, zone: undefined, hosting: { country: "SN" } } : c)) as never };
    expect(run(sn, { network: { ip: "51.1.1.1", country: "FR", name: "OVH" } }, "core.drift.hosting-country").status).toBe("fail");
    expect(run(sn, { network: { ip: "41.1.1.1", country: "SN", name: "SONATEL" } }, "core.drift.hosting-country").status).toBe("pass");
    expect(run(sn, { network: { ip: "104.1.1.1", country: "US" }, edge: "cloudflare" }, "core.drift.hosting-country").status).toBe("na");
  });

  it("flags trackers missing from the architecture", () => {
    const noAnalytics: Spec = { ...spec, features: spec.features.filter((f) => f !== "analytics"), components: spec.components.filter((c) => c.kind !== "analytics") };
    const html = { lang: "fr", links: [], scripts: ["https://www.googletagmanager.com/gtag/js?id=G-1"], iframes: [], images: 0, imagesWithoutAlt: 0, forms: 0, passwordFieldsOverHttp: 0 };
    expect(run(noAnalytics, { html }, "core.drift.undeclared-trackers").status).toBe("fail");
    expect(run(noAnalytics, {}, "core.drift.undeclared-trackers").status).toBe("pass");
  });
});

describe("lighthouse", () => {
  const crawl = (lighthouse: object | undefined) => ({
    browser: "chromium",
    startedAt: "2026-11-25T10:00:00.000Z",
    durationMs: 1000,
    maxPages: 20,
    truncated: false,
    pages: [{ url: "https://s.sn/", status: 200, h1: 1, noindex: false, timing: {}, bytes: 0, requests: 1, consoleErrors: 0 }],
    brokenLinks: [],
    thirdParties: [],
    cookiesBeforeConsent: [],
    mixedContent: [],
    blockedRequests: 0,
    lighthouse,
  });
  const web = (lh: object | undefined) =>
    ({ url: "https://s.sn", env: "prod", finalUrl: "https://s.sn/", fetchedAt: "2026-11-25T10:00:00.000Z", ok: true, status: 200, httpsRedirect: true, headers: {}, setCookies: [], wellKnown: { robotsTxt: true, securityTxt: true, sitemap: true }, timing: { ttfbMs: 1, totalMs: 1 }, bytes: 1, crawl: crawl(lh) }) as never;
  const run = (lh: object | undefined) => evaluate(load("ecommerce"), { asOf: AS_OF, web: web(lh) }).results.find((r) => r.ruleId === "core.web.lighthouse")!;

  it("grades the scores", () => {
    const scores = (performance: number, seo = 95, bestPractices = 95) => ({ url: "https://s.sn/", durationMs: 1, scores: { performance, accessibility: 90, bestPractices, seo } });
    expect(run(scores(95)).status).toBe("pass");
    expect(run(scores(70)).status).toBe("warn");
    const low = run(scores(30));
    expect(low.status).toBe("fail");
    expect(low.severity).toBe("major");
    expect(run(undefined).status).toBe("not-run");
  });
});
