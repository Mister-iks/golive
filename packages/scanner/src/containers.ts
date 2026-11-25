import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ContainerFinding } from "@golive/packs-sdk";
import { basename } from "./files";

const SECRET_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY)/i;
const DATASTORE_IMAGE = /(^|\/)(postgres|postgis|mysql|mariadb|mongo|redis|valkey|rabbitmq|elasticsearch|opensearch|memcached|minio|cassandra|couchdb|clickhouse)(:|$)/i;
const DATASTORE_PORTS = new Set([5432, 3306, 27017, 6379, 5672, 15672, 9200, 11211, 9000, 9042, 5984, 8123]);

export const isDockerfile = (f: string) => /^(Dockerfile|Containerfile)(\..+)?$|\.dockerfile$/i.test(basename(f));
export const isComposeFile = (f: string) => /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/i.test(basename(f));

export function scanContainers(root: string, files: string[]): ContainerFinding[] {
  const out: ContainerFinding[] = [];
  for (const file of files) {
    let text: string;
    try {
      if (isDockerfile(file)) {
        text = readFileSync(join(root, file), "utf8");
        out.push(...checkDockerfile(file, text));
      } else if (isComposeFile(file)) {
        text = readFileSync(join(root, file), "utf8");
        out.push(...checkCompose(file, text));
      }
    } catch {
      /* unreadable file: skip */
    }
  }
  return out;
}

export function checkDockerfile(file: string, text: string): ContainerFinding[] {
  const out: ContainerFinding[] = [];
  // Join continuation lines but remember where each instruction starts.
  const instructions: { line: number; cmd: string; args: string }[] = [];
  let buf = "";
  let start = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!buf && (!line || line.startsWith("#"))) return;
    if (!buf) start = i + 1;
    buf += `${line.replace(/\\$/, "")} `;
    if (!line.endsWith("\\")) {
      const m = /^(\w+)\s+(.*)$/.exec(buf.trim());
      if (m) instructions.push({ line: start, cmd: m[1]!.toUpperCase(), args: m[2]! });
      buf = "";
    }
  });

  const stages = new Set<string>();
  let user: { line: number; value: string } | undefined;
  for (const ins of instructions) {
    if (ins.cmd === "FROM") {
      user = undefined; // USER resets per stage
      const parts = ins.args.split(/\s+/).filter((p) => !p.startsWith("--"));
      const image = parts[0] ?? "";
      const alias = /\bAS\s+(\S+)/i.exec(ins.args)?.[1];
      if (image !== "scratch" && !stages.has(image.toLowerCase()) && !image.includes("@sha256:") && !image.includes("$")) {
        const tag = image.includes(":") ? image.slice(image.lastIndexOf(":") + 1) : "";
        if (!tag || tag === "latest" || tag.includes("/")) {
          out.push({ file, line: ins.line, check: "unpinned-image", message: `Base image not pinned: ${image}`, subject: image });
        }
      }
      if (alias) stages.add(alias.toLowerCase());
    } else if (ins.cmd === "USER") {
      user = { line: ins.line, value: ins.args.trim() };
    } else if (ins.cmd === "ENV" || ins.cmd === "ARG") {
      for (const m of ins.args.matchAll(/([A-Za-z_][A-Za-z0-9_]*)(?:=|\s+)("[^"]*"|'[^']*'|\S+)?/g)) {
        const key = m[1]!;
        const value = (m[2] ?? "").replace(/^["']|["']$/g, "");
        if (SECRET_KEY.test(key) && value && !value.startsWith("$") && value.length >= 6) {
          out.push({ file, line: ins.line, check: "secret-in-image", message: `${key} is hard-coded in the image (${ins.cmd})`, subject: key });
        }
      }
    }
  }

  if (instructions.some((i) => i.cmd === "FROM")) {
    const root = !user || /^(root|0)(:|$)/.test(user.value);
    if (root) {
      out.push({
        file,
        line: user?.line,
        check: "root-user",
        message: user ? "The final container explicitly runs as root." : "No USER instruction: the final container runs as root.",
      });
    }
  }
  return out;
}

export function checkCompose(file: string, text: string): ContainerFinding[] {
  const out: ContainerFinding[] = [];
  const doc = parseYaml(text) as { services?: Record<string, { image?: string; ports?: unknown[]; privileged?: boolean }> } | null;
  for (const [name, svc] of Object.entries(doc?.services ?? {})) {
    if (!svc || typeof svc !== "object") continue;
    if (svc.privileged === true) {
      out.push({ file, check: "privileged", message: `Le service ${name} tourne en mode privileged.`, subject: name });
    }
    const isStore = DATASTORE_IMAGE.test(svc.image ?? "") || DATASTORE_IMAGE.test(`${name}:`);
    for (const p of svc.ports ?? []) {
      const published = publishedPort(p);
      if (!published || published.loopback) continue;
      if (isStore || DATASTORE_PORTS.has(published.container)) {
        out.push({
          file,
          check: "published-datastore",
          message: `Service ${name} publishes port ${published.container} on every host interface.`,
          subject: name,
        });
      }
    }
  }
  return out;
}

function publishedPort(p: unknown): { container: number; loopback: boolean } | undefined {
  if (typeof p === "number") return undefined; // container port only, not published
  if (typeof p === "object" && p) {
    const o = p as { target?: number; published?: number | string; host_ip?: string };
    if (!o.published || !o.target) return undefined;
    return { container: Number(o.target), loopback: o.host_ip === "127.0.0.1" || o.host_ip === "::1" };
  }
  const s = String(p).replace(/\/(tcp|udp)$/, "");
  const parts = s.split(":");
  if (parts.length < 2) return undefined;
  const container = Number(parts[parts.length - 1]!.split("-")[0]);
  const ip = parts.length >= 3 ? parts.slice(0, -2).join(":").replace(/^\[|\]$/g, "") : "";
  return { container, loopback: ip === "127.0.0.1" || ip === "::1" || ip === "localhost" };
}
