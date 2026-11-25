import { lookup } from "node:dns/promises";
import { fetch, type Agent } from "undici";
import type { ExposedFile, WebObservation } from "@golive/packs-sdk";
import { SENSITIVE_PATHS } from "./exposure";
import { USER_AGENT } from "./ua";

/** Edge networks recognised from response headers. Keys match the techs of the "cdn" and "waf" kinds. */
const EDGES: [string, (h: Record<string, string>) => boolean][] = [
  ["cloudflare", (h) => !!h["cf-ray"] || /cloudflare/i.test(h.server ?? "")],
  ["cloudfront", (h) => !!h["x-amz-cf-id"] || /cloudfront/i.test(h.via ?? "")],
  ["fastly", (h) => !!h["x-fastly-request-id"] || /fastly/i.test(h["x-served-by"] ?? "") || /fastly/i.test(h.server ?? "")],
  ["akamai", (h) => /akamai/i.test(h.server ?? "") || Object.keys(h).some((k) => k.startsWith("x-akamai"))],
  ["bunny", (h) => /bunnycdn/i.test(h.server ?? "") || !!h["cdn-pullzone"]],
  ["azure-front-door", (h) => !!h["x-azure-ref"]],
  ["vercel", (h) => !!h["x-vercel-id"]],
  ["netlify", (h) => !!h["x-nf-request-id"] || /netlify/i.test(h.server ?? "")],
  ["google-cloud", (h) => /\bgoogle\b/i.test(h.via ?? "")],
  ["sucuri", (h) => !!h["x-sucuri-id"]],
];

export function detectEdge(headers: Record<string, string>): string | undefined {
  return EDGES.find(([, test]) => test(headers))?.[0];
}

/** Fetches each sensitive path once (GET, 8 KB at most) and keeps only confirmed exposures. */
export async function checkExposedFiles(origin: string, agent: Agent, timeoutMs: number): Promise<ExposedFile[]> {
  const found: ExposedFile[] = [];
  const queue = [...SENSITIVE_PATHS];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const res = await fetch(new URL(item.path, origin), {
          redirect: "manual",
          dispatcher: agent,
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status !== 200 || !res.body) {
          await res.body?.cancel().catch(() => {});
          continue;
        }
        const body = await readStart(res.body as AsyncIterable<Uint8Array>, 8_192);
        if (item.match(body, res.headers.get("content-type") ?? "")) found.push({ path: item.path, kind: item.kind, status: res.status });
      } catch {
        // Unreachable path: nothing exposed there.
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

async function readStart(body: AsyncIterable<Uint8Array>, max: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    size += chunk.byteLength;
    if (size >= max) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, max));
}

/**
 * Who the answering IP address is registered to, from the public RDAP registries
 * (the successor of whois). This is the registrant of the network block, a good hint
 * of the hosting provider and country, not a precise geolocation.
 */
export async function lookupNetwork(hostname: string, timeoutMs = 6_000): Promise<WebObservation["network"]> {
  const { address: ip } = await lookup(hostname);
  try {
    const res = await globalThis.fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
      headers: { accept: "application/rdap+json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ip };
    const data = (await res.json()) as { country?: string; name?: string; port43?: string; entities?: { vcardArray?: unknown[] }[] };
    return { ip, country: data.country?.toUpperCase(), name: data.name, registry: data.port43?.replace(/^whois\./, "") };
  } catch {
    return { ip };
  }
}
