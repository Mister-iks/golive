import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ecosystem, RepoObservation, Vulnerability } from "@golive/packs-sdk";
import { basename, dirname } from "./files";

export interface Pkg {
  name: string;
  version: string;
  ecosystem: Ecosystem;
  file: string;
}

type Parser = (text: string) => { name: string; version: string }[];

/** Lockfiles we can read, and the manifest each one locks. */
const LOCKFILES: Record<string, { ecosystem: Ecosystem; manifest: string; parse: Parser }> = {
  "package-lock.json": { ecosystem: "npm", manifest: "package.json", parse: parseNpmLock },
  "pnpm-lock.yaml": { ecosystem: "npm", manifest: "package.json", parse: parsePnpmLock },
  "yarn.lock": { ecosystem: "npm", manifest: "package.json", parse: parseYarnLock },
  "composer.lock": { ecosystem: "Packagist", manifest: "composer.json", parse: parseComposerLock },
  "poetry.lock": { ecosystem: "PyPI", manifest: "pyproject.toml", parse: parseTomlPackages },
  "requirements.txt": { ecosystem: "PyPI", manifest: "requirements.txt", parse: parseRequirements },
  "go.sum": { ecosystem: "Go", manifest: "go.mod", parse: parseGoSum },
  "Gemfile.lock": { ecosystem: "RubyGems", manifest: "Gemfile", parse: parseGemfileLock },
  "Cargo.lock": { ecosystem: "crates.io", manifest: "Cargo.toml", parse: parseTomlPackages },
};

const MANIFESTS: Record<string, Ecosystem> = {
  "package.json": "npm",
  "composer.json": "Packagist",
  "pyproject.toml": "PyPI",
  "go.mod": "Go",
  Gemfile: "RubyGems",
  "Cargo.toml": "crates.io",
};

export function collectPackages(root: string, files: string[]) {
  const packages: Pkg[] = [];
  const manifests: RepoObservation["dependencies"]["manifests"] = [];
  const lockedDirs = new Map<string, Set<Ecosystem>>();

  for (const file of files) {
    const lock = LOCKFILES[basename(file)];
    if (!lock) continue;
    let list: { name: string; version: string }[] = [];
    try {
      list = lock.parse(readFileSync(join(root, file), "utf8"));
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (const p of list) {
      const key = `${p.name}@${p.version}`;
      if (!p.name || !p.version || seen.has(key)) continue;
      seen.add(key);
      packages.push({ ...p, ecosystem: lock.ecosystem, file });
    }
    manifests.push({ file, ecosystem: lock.ecosystem, packages: seen.size, lockfile: basename(file) !== "requirements.txt" || list.length > 0 });
    const dir = dirname(file);
    lockedDirs.set(dir, new Set([...(lockedDirs.get(dir) ?? []), lock.ecosystem]));
  }

  // Manifests without a lockfile next to them: builds are not reproducible.
  for (const file of files) {
    const eco = MANIFESTS[basename(file)];
    if (!eco || basename(file) === "requirements.txt") continue;
    const dir = dirname(file);
    if (lockedDirs.get(dir)?.has(eco)) continue;
    if (eco === "npm" && isWorkspaceMember(dir, lockedDirs)) continue;
    manifests.push({ file, ecosystem: eco, packages: 0, lockfile: false });
  }

  return { packages, manifests };
}

/** In a monorepo, package.json files below a locked root share its lockfile. */
function isWorkspaceMember(dir: string, locked: Map<string, Set<Ecosystem>>) {
  for (const [d, ecos] of locked) {
    if (ecos.has("npm") && (d === "" || dir.startsWith(`${d}/`))) return true;
  }
  return false;
}

/* --------------------------------------------------------------- parsers */

function parseNpmLock(text: string) {
  const json = JSON.parse(text) as { packages?: Record<string, { version?: string; link?: boolean; name?: string }>; dependencies?: Record<string, { version?: string }> };
  if (json.packages) {
    return Object.entries(json.packages)
      // Only installed packages: workspace members are not under node_modules/.
      .filter(([path, p]) => path.includes("node_modules/") && !p.link && p.version)
      .map(([path, p]) => ({ name: p.name ?? path.slice(path.lastIndexOf("node_modules/") + 13), version: p.version! }));
  }
  return Object.entries(json.dependencies ?? {}).map(([name, p]) => ({ name, version: p.version ?? "" }));
}

function parsePnpmLock(text: string) {
  const doc = parseYaml(text) as { packages?: Record<string, unknown> };
  return Object.keys(doc.packages ?? {}).map((key) => {
    // v9: "@scope/name@1.2.3(peer@x)"; v6: "/@scope/name@1.2.3"; v5: "/name/1.2.3"
    const k = key.replace(/^\//, "").replace(/\(.*$/, "");
    const at = k.lastIndexOf("@");
    if (at > 0) return { name: k.slice(0, at), version: k.slice(at + 1) };
    const slash = k.lastIndexOf("/");
    return { name: k.slice(0, slash), version: k.slice(slash + 1) };
  });
}

function parseYarnLock(text: string) {
  const out: { name: string; version: string }[] = [];
  let current: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(" ") && line.trim() && !line.startsWith("#") && !line.startsWith("__metadata")) {
      const first = line.replace(/:$/, "").split(",")[0]!.trim().replace(/^"|"$/g, "");
      const at = first.lastIndexOf("@");
      current = at > 0 ? first.slice(0, at) : first;
      if (current.includes("@npm:")) current = current.split("@npm:")[0];
    } else if (current) {
      const m = /^\s+version:?\s+"?([^"\s]+)"?/.exec(line);
      if (m) {
        out.push({ name: current, version: m[1]! });
        current = undefined;
      }
    }
  }
  return out;
}

function parseComposerLock(text: string) {
  const json = JSON.parse(text) as { packages?: { name: string; version: string }[]; "packages-dev"?: { name: string; version: string }[] };
  return [...(json.packages ?? []), ...(json["packages-dev"] ?? [])].map((p) => ({ name: p.name, version: p.version.replace(/^v/, "") }));
}

function parseTomlPackages(text: string) {
  const out: { name: string; version: string }[] = [];
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name && version) out.push({ name, version });
  }
  return out;
}

function parseRequirements(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9_.+-]+)/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ name: m[1]!, version: m[2]! }));
}

function parseGoSum(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 2)
    .map(([name, version]) => ({ name: name!, version: version!.replace(/\/go\.mod$/, "") }));
}

function parseGemfileLock(text: string) {
  const out: { name: string; version: string }[] = [];
  let inSpecs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s{2}specs:/.test(line)) inSpecs = true;
    else if (/^\S/.test(line)) inSpecs = false;
    else if (inSpecs) {
      const m = /^\s{4}([A-Za-z0-9_.-]+) \(([^)]+)\)$/.exec(line);
      if (m) out.push({ name: m[1]!, version: m[2]!.split("-")[0]! });
    }
  }
  return out;
}

/* ------------------------------------------------------------------- OSV */

const OSV = "https://api.osv.dev/v1";
const MAX_DETAILS = 300;

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: { type: string; score: string }[];
  database_specific?: { severity?: string };
  affected?: { package?: { name: string; ecosystem: string }; ranges?: { events: Record<string, string>[] }[] }[];
}

/** Looks up known vulnerabilities on osv.dev (the database behind OSV-Scanner). */
export async function lookupVulnerabilities(packages: Pkg[], timeoutMs = 20_000): Promise<Vulnerability[]> {
  const hits: { pkg: Pkg; ids: string[] }[] = [];
  for (let i = 0; i < packages.length; i += 1000) {
    const chunk = packages.slice(i, i + 1000);
    const res = await fetch(`${OSV}/querybatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`osv.dev answered ${res.status}`);
    const data = (await res.json()) as { results: { vulns?: { id: string }[] }[] };
    data.results.forEach((r, j) => {
      if (r.vulns?.length) hits.push({ pkg: chunk[j]!, ids: r.vulns.map((v) => v.id) });
    });
  }

  const ids = [...new Set(hits.flatMap((h) => h.ids))].sort().slice(0, MAX_DETAILS);
  const details = new Map<string, OsvVuln>();
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(
      ids.slice(i, i + 8).map(async (id) => {
        try {
          const r = await fetch(`${OSV}/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(timeoutMs) });
          if (r.ok) details.set(id, (await r.json()) as OsvVuln);
        } catch {
          /* keep the id without details */
        }
      }),
    );
  }

  const out: Vulnerability[] = [];
  for (const { pkg, ids: vulnIds } of hits) {
    for (const id of vulnIds) {
      const v = details.get(id);
      out.push({
        id,
        aliases: v?.aliases ?? [],
        package: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        severity: severityOf(v),
        summary: (v?.summary ?? v?.details ?? "").split("\n")[0]!.slice(0, 200),
        fixed: fixedVersion(v, pkg),
        file: pkg.file,
      });
    }
  }
  const rank = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.package.localeCompare(b.package) || a.id.localeCompare(b.id));
}

function severityOf(v?: OsvVuln): Vulnerability["severity"] {
  const s = v?.database_specific?.severity?.toLowerCase();
  if (s === "critical" || s === "high" || s === "low") return s;
  if (s === "moderate" || s === "medium") return "medium";
  const cvss = v?.severity?.find((x) => x.type.startsWith("CVSS"))?.score;
  const base = cvss ? Number(/^(\d+(?:\.\d+)?)$/.exec(cvss)?.[1]) : NaN;
  if (!Number.isNaN(base)) return base >= 9 ? "critical" : base >= 7 ? "high" : base >= 4 ? "medium" : "low";
  return "unknown";
}

function fixedVersion(v: OsvVuln | undefined, pkg: Pkg) {
  const affected = v?.affected?.find((a) => a.package?.name === pkg.name) ?? v?.affected?.[0];
  for (const range of affected?.ranges ?? []) {
    for (const e of range.events) if (e.fixed) return e.fixed;
  }
  return undefined;
}
