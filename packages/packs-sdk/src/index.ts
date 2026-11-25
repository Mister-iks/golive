import type { Component, ComponentKind, Link, Spec } from "@golive/spec";
import { KINDS } from "@golive/spec";

export * from "./repo";
export * from "./web";
import type { RepoObservation } from "./repo";
import type { WebObservation } from "./web";

/* ------------------------------------------------------------------ language */

/** Interface languages. English is the default; rules carry a French translation. */
export type Lang = "en" | "fr";
export const LANGS: readonly Lang[] = ["en", "fr"];
export const isLang = (v: unknown): v is Lang => v === "en" || v === "fr";

/** Picks the message for the evaluation language. Every finding message is written in both. */
export const tr = (ctx: { lang: Lang }, en: string, fr: string) => (ctx.lang === "fr" ? fr : en);

/* ------------------------------------------------------------------ types */

export type Severity = "blocker" | "major" | "minor" | "info";
/**
 * pass: OK · warn: warning · fail: failure · na: not applicable
 * evidence: proof required (cannot be verified automatically)
 * not-run: the layer that feeds this rule has not been executed yet
 */
export type Status = "pass" | "warn" | "fail" | "na" | "evidence" | "not-run";
export type Layer = 1 | 2 | 3 | 4;
export type Category = "architecture" | "security" | "data" | "operations" | "quality" | "legal";
export type Method = "auto" | "evidence" | "hybrid";

export interface Source {
  label: string;
  url?: string;
}

export interface Finding {
  status: Status;
  message: string;
  /** Component, actor or link id the finding is attached to. */
  target?: string;
  /** Short machine-readable proof (header value, version, country…). */
  observed?: string;
  /** Overrides the rule severity for this finding only. */
  severity?: Severity;
}

export interface RuleContext {
  spec: Spec;
  graph: Graph;
  /** Reference date (YYYY-MM-DD). Part of the input, so results stay reproducible. */
  asOf: string;
  /** Layer 2 observation of the code repository, when a scan ran. */
  repo?: RepoObservation;
  /** Layer 3 observation of the deployed target, when an audit ran. */
  web?: WebObservation;
  /** Language of the messages. Never changes the outcome of a rule. */
  lang: Lang;
}

/** French version of a rule's texts. English is written in the rule itself. */
export interface RuleTranslation {
  title?: string;
  why?: string;
  fix?: string;
  /** Label of the source, when it differs in French. */
  source?: string;
}

export interface Rule {
  /** Stable identifier, e.g. `sn.cdp.declaration`. Never reuse a retired id. */
  id: string;
  title: string;
  /** One sentence: why this matters before going live. */
  why: string;
  layer: Layer;
  category: Category;
  severity: Severity | ((ctx: RuleContext) => Severity);
  method: Method;
  source: Source;
  /** How to fix, in plain language. */
  fix: string;
  /** Return false when the rule does not concern this project. */
  applies?: (ctx: RuleContext) => boolean;
  check: (ctx: RuleContext) => Finding | Finding[];
  /** Legal rules always carry a "to be validated by a lawyer" notice. */
  legal?: boolean;
  /** French texts. */
  fr?: RuleTranslation;
}

export interface Pack {
  id: string;
  name: string;
  version: string;
  description: string;
  maintainer: string;
  /** Last legal or expert review (YYYY-MM-DD). Packs not reviewed for 12 months are flagged. */
  reviewedAt?: string;
  reviewer?: string;
  /** Packs enabled by default for new projects. */
  core?: boolean;
  /** Suggest this pack when the project targets one of these countries. */
  countries?: string[];
  rules: Rule[];
  /** French name and description. */
  fr?: { name?: string; description?: string };
}

export function defineRule(rule: Rule): Rule {
  return rule;
}

export function definePack(pack: Pack): Pack {
  const seen = new Set<string>();
  for (const r of pack.rules) {
    if (seen.has(r.id)) throw new Error(`[${pack.id}] duplicate rule: ${r.id}`);
    seen.add(r.id);
  }
  return pack;
}

/* ------------------------------------------------------------- outcomes */

export const pass = (message: string, extra?: Partial<Finding>): Finding => ({ status: "pass", message, ...extra });
export const fail = (message: string, extra?: Partial<Finding>): Finding => ({ status: "fail", message, ...extra });
export const warn = (message: string, extra?: Partial<Finding>): Finding => ({ status: "warn", message, ...extra });
export const na = (message: string = DEFAULT_MESSAGES.na): Finding => ({ status: "na", message });
export const evidence = (message: string, extra?: Partial<Finding>): Finding => ({ status: "evidence", message, ...extra });
export const notRun = (message: string = DEFAULT_MESSAGES.notRun): Finding => ({ status: "not-run", message });
export const notScanned = (): Finding => ({ status: "not-run", message: DEFAULT_MESSAGES.notScanned });

/** Messages helpers use when a rule gives none. The engine translates them. */
export const DEFAULT_MESSAGES = {
  na: "Not applicable to this project.",
  notRun: "No URL audited yet.",
  notScanned: "Repository not scanned. Run golive check --repo . in your CI.",
} as const;

export const DEFAULT_MESSAGES_FR: Record<string, string> = {
  [DEFAULT_MESSAGES.na]: "Non applicable à ce projet.",
  [DEFAULT_MESSAGES.notRun]: "Aucune URL auditée pour l'instant.",
  [DEFAULT_MESSAGES.notScanned]: "Dépôt non analysé. Lancez golive check --repo . dans votre CI.",
};

/* ---------------------------------------------------------------- graph */

const CLIENT_ACTORS = new Set(["visitor", "user", "admin", "partner"]);

export interface Graph {
  components: Component[];
  byId: Map<string, Component>;
  ofKind: (...kinds: ComponentKind[]) => Component[];
  has: (...kinds: ComponentKind[]) => boolean;
  linksFrom: (id: string) => Link[];
  linksTo: (id: string) => Link[];
  linked: (a: string, b: string) => boolean;
  /** "public" if reachable from the Internet, "managed" for third-party SaaS. */
  exposure: (c: Component) => "public" | "private" | "managed";
  /** ISO country where the component is hosted, if declared. */
  country: (c: Component) => string | undefined;
  provider: (c: Component) => string | undefined;
  isActor: (id: string) => boolean;
  label: (id: string) => string;
}

export function buildGraph(spec: Spec): Graph {
  const byId = new Map(spec.components.map((c) => [c.id, c]));
  const actors = new Map(spec.actors.map((a) => [a.id, a]));
  const zones = new Map(spec.zones.map((z) => [z.id, z]));
  const from = new Map<string, Link[]>();
  const to = new Map<string, Link[]>();
  for (const l of spec.links) {
    from.set(l.from, [...(from.get(l.from) ?? []), l]);
    to.set(l.to, [...(to.get(l.to) ?? []), l]);
  }

  const exposure = (c: Component): "public" | "private" | "managed" => {
    if (c.exposure) return c.exposure;
    const def = KINDS[c.kind].exposure;
    if (def === "managed") return "managed";
    const hitByClient = (to.get(c.id) ?? []).some((l) => {
      const a = actors.get(l.from);
      return a ? CLIENT_ACTORS.has(a.kind) : false;
    });
    if (hitByClient) return "public";
    const zone = c.zone ? zones.get(c.zone) : undefined;
    if (zone?.network === "public") return "public";
    return def;
  };

  return {
    components: spec.components,
    byId,
    ofKind: (...kinds) => spec.components.filter((c) => kinds.includes(c.kind)),
    has: (...kinds) => spec.components.some((c) => kinds.includes(c.kind)),
    linksFrom: (id) => from.get(id) ?? [],
    linksTo: (id) => to.get(id) ?? [],
    linked: (a, b) => spec.links.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a)),
    exposure,
    country: (c) => c.hosting?.country ?? (c.zone ? zones.get(c.zone)?.country : undefined),
    provider: (c) => c.hosting?.provider ?? (c.zone ? zones.get(c.zone)?.provider : undefined),
    isActor: (id) => actors.has(id),
    label: (id) => {
      const c = byId.get(id);
      if (c) return c.name ?? c.id;
      const a = actors.get(id);
      return a?.name ?? a?.id ?? id;
    },
  };
}

/* -------------------------------------------------------------- helpers */

export const hasFeature = (ctx: RuleContext, ...f: Spec["features"]) => f.some((x) => ctx.spec.features.includes(x));
export const targetsCountry = (ctx: RuleContext, ...c: string[]) => c.some((x) => ctx.spec.project.countries.includes(x));
export const handlesPersonalData = (ctx: RuleContext) =>
  ctx.spec.data.personal.length > 0 || ctx.spec.data.sensitive.length > 0 || hasFeature(ctx, "accounts", "forms", "newsletter", "payment");
export const handlesSensitiveData = (ctx: RuleContext) => ctx.spec.data.sensitive.length > 0;
export const isCritical = (ctx: RuleContext) => ctx.spec.project.criticality !== "standard";
/** Components that store data (where personal data at rest would live). */
export const dataStores = (ctx: RuleContext) => ctx.graph.ofKind("database", "storage", "cache", "queue");
