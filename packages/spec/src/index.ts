import { Document, LineCounter, isMap, isNode, isScalar, isSeq, parseDocument, visit } from "yaml";
import { specSchema, SPEC_VERSION, type Spec, type SpecInput } from "./schema";

export * from "./schema";
export * from "./catalog";
export * from "./templates";

export interface SpecIssue {
  path: (string | number)[];
  message: string;
  line?: number;
  column?: number;
}

export type ParseResult =
  | { ok: true; spec: Spec; issues: [] }
  | { ok: false; spec?: undefined; issues: SpecIssue[] };

/** Parse and validate a golive.yaml document. Never throws. */
export function parseSpec(source: string): ParseResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, prettyErrors: false });

  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((e) => {
        const pos = e.linePos?.[0];
        return { path: [], message: e.message.split("\n")[0] ?? e.message, line: pos?.line, column: pos?.col };
      }),
    };
  }

  const raw = doc.toJS() as unknown;
  const locate = (path: (string | number)[]) => {
    for (let i = path.length; i >= 0; i--) {
      const node = doc.getIn(path.slice(0, i), true);
      if (isNode(node) && node.range) {
        const p = lineCounter.linePos(node.range[0]);
        return { line: p.line, column: p.col };
      }
    }
    return {};
  };

  const result = validateSpec(raw);
  if (!result.ok) {
    return { ok: false, issues: result.issues.map((i) => ({ ...i, ...locate(i.path) })) };
  }
  return result;
}

/** Validate an already-parsed object (e.g. from the Studio). */
export function validateSpec(raw: unknown): ParseResult {
  const parsed = specSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
        message: i.message,
      })),
    };
  }
  const spec = parsed.data;
  const issues: SpecIssue[] = [];

  const ids = new Map<string, string>();
  const register = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) issues.push({ path, message: `duplicate id: "${id}"` });
    ids.set(id, path.join("."));
  };
  spec.components.forEach((c, i) => register(c.id, ["components", i, "id"]));
  spec.actors.forEach((a, i) => register(a.id, ["actors", i, "id"]));

  const zoneIds = new Set(spec.zones.map((z) => z.id));
  spec.components.forEach((c, i) => {
    if (c.zone && !zoneIds.has(c.zone)) {
      issues.push({ path: ["components", i, "zone"], message: `unknown zone: "${c.zone}"` });
    }
  });
  spec.links.forEach((l, i) => {
    if (!ids.has(l.from)) issues.push({ path: ["links", i, "from"], message: `unknown element: "${l.from}"` });
    if (!ids.has(l.to)) issues.push({ path: ["links", i, "to"], message: `unknown element: "${l.to}"` });
  });

  if (issues.length) return { ok: false, issues };
  return { ok: true, spec, issues: [] };
}

/** Serialise a spec to canonical, diff-friendly YAML (empty sections omitted). */
export function stringifySpec(spec: Spec | SpecInput): string {
  const s = spec as Spec;
  const out: Record<string, unknown> = { spec: SPEC_VERSION };

  out.project = prune({
    name: s.project.name,
    type: s.project.type,
    description: s.project.description,
    countries: s.project.countries,
    languages: s.project.languages,
    audience: s.project.audience,
    criticality: s.project.criticality === "standard" ? undefined : s.project.criticality,
  });
  if (s.data && (s.data.personal?.length || s.data.sensitive?.length)) {
    out.data = { personal: s.data.personal ?? [], sensitive: s.data.sensitive ?? [] };
  }
  if (s.features?.length) out.features = s.features;
  if (s.zones?.length) out.zones = s.zones.map(prune);
  if (s.actors?.length) out.actors = s.actors.map(prune);
  if (s.components?.length) {
    out.components = s.components.map((c) => prune({ ...c, hosting: c.hosting ? prune(c.hosting) : undefined }));
  }
  if (s.links?.length) out.links = s.links.map(prune);
  const targets = prune(s.targets ?? {});
  if (Object.keys(targets).length) out.targets = targets;
  if (s.profiles?.length) out.profiles = s.profiles;
  if (s.evidence && Object.keys(s.evidence).length) out.evidence = mapValues(s.evidence, prune);
  if (s.waivers?.length) out.waivers = s.waivers.map(prune);
  if (s.layout && Object.keys(s.layout).length) out.layout = s.layout;

  const doc = new Document(out);
  visit(doc, {
    Pair(_, pair) {
      const key = isScalar(pair.key) ? String(pair.key.value) : "";
      if (FLOW_KEYS.has(key) && isSeq(pair.value)) pair.value.flow = true;
      if (key === "layout" && isMap(pair.value)) {
        for (const item of pair.value.items) if (isSeq(item.value)) item.value.flow = true;
      }
      if (key === "hosting" && isMap(pair.value)) pair.value.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0, flowCollectionPadding: true });
}

const FLOW_KEYS = new Set(["countries", "languages", "personal", "sensitive", "features", "profiles"]);

function prune<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

function mapValues<V, R>(rec: Record<string, V>, fn: (v: V) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, fn(v)]));
}

/** Split `postgresql@17` into `{ name: "postgresql", version: "17" }`. */
export function parseTech(tech: string | undefined): { name: string; version?: string } | undefined {
  if (!tech) return undefined;
  const at = tech.lastIndexOf("@");
  if (at <= 0) return { name: tech.toLowerCase() };
  return { name: tech.slice(0, at).toLowerCase(), version: tech.slice(at + 1) };
}

export function emptySpec(name = "New project"): Spec {
  return specSchema.parse({ spec: SPEC_VERSION, project: { name } });
}
