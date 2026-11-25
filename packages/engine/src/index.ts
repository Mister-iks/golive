import { COMMUNITY_PACKS, PROFILE_ALIASES } from "@golive/packs";
import {
  buildGraph,
  type Category,
  type Finding,
  type Layer,
  type Method,
  type Pack,
  type RepoObservation,
  type Rule,
  type RuleContext,
  type Severity,
  type Source,
  type Status,
  type WebObservation,
  tr,
  DEFAULT_MESSAGES_FR,
  type Lang,
} from "@golive/packs-sdk";
import type { Evidence, Spec, Waiver } from "@golive/spec";

export const ENGINE_VERSION = "0.1.0";

export type Decision = "go" | "conditional" | "no-go";

export interface RuleResult {
  ruleId: string;
  packId: string;
  title: string;
  why: string;
  fix: string;
  layer: Layer;
  category: Category;
  method: Method;
  severity: Severity;
  status: Status;
  findings: (Finding & { severity: Severity })[];
  source: Source;
  legal: boolean;
  attested?: Evidence;
  waiver?: Waiver;
  /** True when the rule blocks the Go and is not covered by a valid waiver. */
  blocking: boolean;
}

export interface Report {
  engine: string;
  asOf: string;
  /** Language of the texts in this report. */
  lang: Lang;
  fingerprint: string;
  project: { name: string; type: string };
  packs: { id: string; name: string; version: string; reviewedAt?: string; stale: boolean }[];
  results: RuleResult[];
  score: { global: number; byCategory: Partial<Record<Category, number>> };
  threshold: number;
  verdict: { decision: Decision; reasons: string[] };
  counts: Record<Status, number> & { blocking: number; waived: number };
  coverage: {
    layers: Layer[];
    repo?: { root: string; scannedAt: string; files: number; tools: string[] };
    web?: { url: string; env: "prod" | "preprod"; fetchedAt: string };
  };
}

export interface EvaluateOptions {
  /** Reference date, YYYY-MM-DD. Defaults to today (UTC). */
  asOf?: string;
  /** Pack registry. Defaults to the community packs. */
  registry?: Pack[];
  /** Layer 2 observation of the repository. */
  repo?: RepoObservation;
  /** Layer 3 observation. */
  web?: WebObservation;
  /** Language of titles, explanations and messages (default English). Does not change the verdict. */
  lang?: Lang;
}

export const SEVERITY_ORDER: Severity[] = ["blocker", "major", "minor", "info"];
const STATUS_ORDER: Status[] = ["fail", "evidence", "warn", "pass", "not-run", "na"];
const WEIGHT: Record<Severity, number> = { blocker: 10, major: 5, minor: 2, info: 1 };
const CREDIT: Partial<Record<Status, number>> = { pass: 1, warn: 0.5, fail: 0, evidence: 0 };

export const CATEGORY_LABELS: Record<Category, string> = {
  architecture: "Architecture",
  security: "Security",
  data: "Data",
  operations: "Operations",
  quality: "Quality",
  legal: "Legal compliance",
};

export const CATEGORY_LABELS_FR: Record<Category, string> = {
  architecture: "Architecture",
  security: "Sécurité",
  data: "Données",
  operations: "Exploitation",
  quality: "Qualité",
  legal: "Conformité légale",
};

export const categoryLabels = (lang: Lang = "en") => (lang === "fr" ? CATEGORY_LABELS_FR : CATEGORY_LABELS);

/** Packs applied to a spec: explicit profiles, otherwise sensible defaults. */
export function selectPacks(spec: Spec, registry: Pack[] = COMMUNITY_PACKS): Pack[] {
  const byId = new Map(registry.map((p) => [p.id, p]));
  const ids = spec.profiles.length ? spec.profiles.map((p) => PROFILE_ALIASES[p] ?? p) : suggestProfiles(spec, registry);
  const out: Pack[] = [];
  for (const id of ids) {
    const pack = byId.get(id);
    if (pack && !out.includes(pack)) out.push(pack);
  }
  return out;
}

/** Profiles PcyBox GoLive recommends for a project, from what it declares. */
export function suggestProfiles(spec: Spec, registry: Pack[] = COMMUNITY_PACKS): string[] {
  const ids = registry.filter((p) => p.core).map((p) => p.id);
  if (spec.features.includes("payment") || spec.components.some((c) => c.kind === "payment")) ids.push("payment");
  if (spec.project.type === "public-service" || spec.project.type === "ecommerce") ids.push("accessibility");
  for (const p of registry) {
    if (p.countries?.some((c) => spec.project.countries.includes(c))) ids.push(p.id);
  }
  return [...new Set(ids)];
}

export function evaluate(spec: Spec, options: EvaluateOptions = {}): Report {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const registry = options.registry ?? COMMUNITY_PACKS;
  const packs = selectPacks(spec, registry);
  const lang: Lang = options.lang ?? "en";
  const ctx: RuleContext = { spec, graph: buildGraph(spec), asOf, repo: options.repo, web: options.web, lang };

  const results: RuleResult[] = [];
  for (const pack of packs) {
    for (const rule of pack.rules) results.push(runRule(pack, rule, ctx));
  }

  const counts = { pass: 0, warn: 0, fail: 0, na: 0, evidence: 0, "not-run": 0, blocking: 0, waived: 0 } as Report["counts"];
  for (const r of results) {
    counts[r.status]++;
    if (r.blocking) counts.blocking++;
    if (r.waiver) counts.waived++;
  }

  const score = computeScore(results);
  const threshold = spec.project.criticality !== "standard" || spec.project.type === "public-service" ? 80 : 70;
  const verdict = decide(results, score.global, threshold, lang);

  // A layer is covered only when its input really exists (a repo scan for 2, a web observation for 3).
  const layers = [
    ...new Set(
      results
        .filter(
          (r) =>
            r.status !== "not-run" &&
            r.status !== "na" &&
            (r.layer !== 2 || !!options.repo) &&
            (r.layer !== 3 || !!options.web?.ok),
        )
        .map((r) => r.layer),
    ),
  ].sort() as Layer[];

  return {
    engine: ENGINE_VERSION,
    asOf,
    lang,
    fingerprint: fingerprint({
      spec: { ...spec, layout: undefined },
      packs: packs.map((p) => `${p.id}@${p.version}`),
      asOf,
      repo: options.repo ? { ...options.repo, scannedAt: undefined, root: undefined } : undefined,
      web: stripTiming(options.web),
    }),
    project: { name: spec.project.name, type: spec.project.type },
    packs: packs.map((p) => ({
      id: p.id,
      name: (lang === "fr" && p.fr?.name) || p.name,
      version: p.version,
      reviewedAt: p.reviewedAt,
      stale: p.rules.some((r) => r.legal) && (!p.reviewedAt || daysSince(p.reviewedAt, asOf) > 365),
    })),
    results,
    score,
    threshold,
    verdict,
    counts,
    coverage: {
      layers,
      repo: options.repo
        ? { root: options.repo.root, scannedAt: options.repo.scannedAt, files: options.repo.files, tools: options.repo.tools.filter((t) => t.used).map((t) => t.name) }
        : undefined,
      web: options.web ? { url: options.web.url, env: options.web.env, fetchedAt: options.web.fetchedAt } : undefined,
    },
  };
}

function runRule(pack: Pack, rule: Rule, ctx: RuleContext): RuleResult {
  const fr = ctx.lang === "fr";
  const baseSeverity = typeof rule.severity === "function" ? rule.severity(ctx) : rule.severity;
  const base = {
    ruleId: rule.id,
    packId: pack.id,
    title: (fr && rule.fr?.title) || rule.title,
    why: (fr && rule.fr?.why) || rule.why,
    fix: (fr && rule.fr?.fix) || rule.fix,
    layer: rule.layer,
    category: rule.category,
    method: rule.method,
    source: fr && rule.fr?.source ? { ...rule.source, label: rule.fr.source } : rule.source,
    legal: !!rule.legal,
  };

  let applies = true;
  try {
    applies = rule.applies ? rule.applies(ctx) : true;
  } catch {
    applies = true;
  }
  if (!applies) {
    return { ...base, severity: baseSeverity, status: "na", findings: [], blocking: false };
  }

  let raw: Finding[];
  try {
    const out = rule.check(ctx);
    raw = Array.isArray(out) ? out : [out];
  } catch (err) {
    raw = [{ status: "warn", message: tr(ctx, `Internal rule error: ${(err as Error).message}`, `Erreur interne de la règle : ${(err as Error).message}`) }];
  }
  // Default helper messages (na, notRun, notScanned) are written in English and translated here.
  let findings = raw.map((f) => ({ ...f, message: (fr && DEFAULT_MESSAGES_FR[f.message]) || f.message, severity: f.severity ?? baseSeverity }));

  // Manual evidence turns "evidence required" findings into passes.
  const proof = ctx.spec.evidence[rule.id];
  const attested = proof && findings.some((f) => f.status === "evidence") ? proof : undefined;
  if (attested) {
    findings = findings.map((f) =>
      f.status === "evidence"
        ? { ...f, status: "pass" as const, message: tr(ctx, `${f.message} Attested by ${attested.by} on ${attested.date}.`, `${f.message} Attesté par ${attested.by} le ${attested.date}.`) }
        : f,
    );
  }

  const status = worst(findings.map((f) => f.status));
  const failing = findings.filter((f) => f.status === "fail" || f.status === "evidence" || f.status === "warn");
  const severity = failing.length ? highest(failing.map((f) => f.severity)) : baseSeverity;

  const waiver = ctx.spec.waivers.find((w) => w.rule === rule.id && w.expires >= ctx.asOf);
  const blocksGo = findings.some((f) => (f.status === "fail" || f.status === "evidence") && f.severity === "blocker");

  return {
    ...base,
    severity,
    status,
    findings,
    attested,
    waiver: blocksGo || status === "fail" || status === "evidence" ? waiver : undefined,
    blocking: blocksGo && !waiver,
  };
}

function worst(statuses: Status[]): Status {
  if (statuses.length === 0) return "pass";
  return STATUS_ORDER.find((s) => statuses.includes(s)) ?? "pass";
}

function highest(sev: Severity[]): Severity {
  return SEVERITY_ORDER.find((s) => sev.includes(s)) ?? "info";
}

function computeScore(results: RuleResult[]): Report["score"] {
  const acc = new Map<Category | "all", { w: number; c: number }>();
  for (const r of results) {
    const credit = CREDIT[r.status];
    if (credit === undefined) continue;
    const w = WEIGHT[r.severity];
    for (const key of [r.category, "all"] as const) {
      const a = acc.get(key) ?? { w: 0, c: 0 };
      a.w += w;
      a.c += w * credit;
      acc.set(key, a);
    }
  }
  const pct = (a?: { w: number; c: number }) => (a && a.w > 0 ? Math.round((a.c / a.w) * 100) : 100);
  const byCategory: Partial<Record<Category, number>> = {};
  for (const [k, v] of acc) if (k !== "all") byCategory[k] = pct(v);
  return { global: pct(acc.get("all")), byCategory };
}

function decide(results: RuleResult[], score: number, threshold: number, lang: Lang): Report["verdict"] {
  const ctx = { lang };
  const reasons: string[] = [];
  const blocking = results.filter((r) => r.blocking);
  const waived = results.filter((r) => r.waiver && r.severity === "blocker");
  const s = (n: number) => (n > 1 ? "s" : "");

  if (blocking.length) {
    const n = blocking.length;
    reasons.push(tr(ctx, `${n} unresolved blocking check${s(n)}.`, `${n} contrôle${s(n)} bloquant${s(n)} non résolu${s(n)}.`));
  }
  if (score < threshold) reasons.push(tr(ctx, `Score ${score} below the threshold of ${threshold} required for this profile.`, `Score ${score} sous le seuil de ${threshold} requis pour ce profil.`));
  if (reasons.length) return { decision: "no-go", reasons };

  if (waived.length) {
    const n = waived.length;
    return { decision: "conditional", reasons: [tr(ctx, `${n} blocker${s(n)} covered by a signed waiver.`, `${n} bloquant${s(n)} couvert${s(n)} par une dérogation signée.`)] };
  }
  return { decision: "go", reasons: [tr(ctx, `No open blocker, score ${score} ≥ ${threshold}.`, `Aucun bloquant ouvert, score ${score} ≥ ${threshold}.`)] };
}

function daysSince(date: string, asOf: string) {
  return (Date.parse(asOf) - Date.parse(date)) / 86_400_000;
}

function stripTiming(web?: WebObservation) {
  if (!web) return undefined;
  const { timing: _t, fetchedAt: _f, ...rest } = web;
  return rest;
}

/** Stable FNV-1a 64-bit hash of the evaluation input (browser and Node). */
export function fingerprint(value: unknown): string {
  const text = stableStringify(value);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(",")}}`;
}

/** Results attached to a given component, actor or link (for the Studio overlay). */
export function findingsByTarget(report: Report) {
  const map = new Map<string, { ruleId: string; title: string; status: Status; severity: Severity; message: string }[]>();
  for (const r of report.results) {
    for (const f of r.findings) {
      if (!f.target || f.status === "pass" || f.status === "na") continue;
      const list = map.get(f.target) ?? [];
      list.push({ ruleId: r.ruleId, title: r.title, status: f.status, severity: f.severity, message: f.message });
      map.set(f.target, list);
    }
  }
  return map;
}

export { COMMUNITY_PACKS, PROFILE_ALIASES };
export type { Category, Finding, Lang, Layer, Pack, RepoObservation, Rule, Severity, Status, WebObservation };
export { reconcileTasks, type TaskColumn, type TaskState } from "./tasks";
