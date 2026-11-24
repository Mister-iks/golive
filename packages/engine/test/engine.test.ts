import { describe, expect, it } from "vitest";
import { TEMPLATES, parseSpec, stringifySpec, validateSpec, type Spec } from "@golive/spec";
import { COMMUNITY_PACKS, evaluate, type RepoObservation } from "../src";

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
    expect(r.issues.map((i) => i.message).join()).toMatch(/inconnu/);
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
      expect(r.findings[0]?.message).toContain("déclare pourtant privée");
    });

    it("layer 2 rules are not-run without a scan, and dependency scanning asks for proof", () => {
      const report = evaluate(load("saas-b2b"), { asOf: AS_OF });
      expect(report.results.find((x) => x.ruleId === "sec.code.secrets")?.status).toBe("not-run");
      expect(report.results.find((x) => x.ruleId === "sec.app.dependency-scan")?.status).toBe("evidence");
      expect(report.coverage.layers).not.toContain(2);
    });
  });
});
