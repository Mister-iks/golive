import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF protection. The audit robot must never reach loopback, private,
 * link-local or cloud metadata addresses, unless the operator explicitly
 * allows it for a self-hosted install auditing an internal pre-production.
 */
export class BlockedAddressError extends Error {
  constructor(host: string, ip: string) {
    super(`Adresse refusée pour ${host} (${ip}) : réseau privé ou réservé.`);
    this.name = "BlockedAddressError";
  }
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedIp(mapped[1]!);
    if (lower === "::" || lower === "::1") return true;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith("2001:db8")) return true; // documentation
    return false;
  }
  return true;
}

export interface GuardOptions {
  allowPrivate?: boolean;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A dns.lookup replacement that refuses blocked addresses at connect time (defeats DNS rebinding). */
export function guardedLookup(opts: GuardOptions) {
  return (hostname: string, options: object, callback: LookupCb) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const list = addresses as LookupAddress[];
      if (!opts.allowPrivate) {
        const bad = list.find((a) => isBlockedIp(a.address));
        if (bad) return callback(new BlockedAddressError(hostname, bad.address), []);
      }
      if ((options as { all?: boolean }).all) return callback(null, list);
      const first = list[0];
      if (!first) return callback(new Error(`Aucune adresse pour ${hostname}`), []);
      callback(null, first.address, first.family);
    });
  };
}

export function assertUrlAllowed(raw: string, opts: GuardOptions): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`URL invalide : ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Seules les URL http et https sont auditées.");
  if (url.username || url.password) throw new Error("Les identifiants dans l'URL ne sont pas acceptés.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!opts.allowPrivate) {
    if (isIP(host) && isBlockedIp(host)) throw new BlockedAddressError(host, host);
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new BlockedAddressError(host, host);
  }
  return url;
}
