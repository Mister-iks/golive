import type { ExposedFile } from "@golive/packs-sdk";

/**
 * Files that must never be served publicly. Each one is fetched once with a plain GET
 * and only reported when its content has the expected signature, so a site that answers
 * 200 with its home page for any path (soft 404) does not raise false alarms.
 */
export interface SensitivePath {
  path: string;
  kind: ExposedFile["kind"];
  /** True when the first bytes really are this file. */
  match: (body: string, contentType: string) => boolean;
}

const notHtml = (body: string, ct: string) => !/html/i.test(ct) && !/^\s*<(!doctype|html|head|body)/i.test(body);

const envFile = (body: string, ct: string) => notHtml(body, ct) && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/m.test(body) && (body.match(/^\s*[A-Z][A-Z0-9_]{2,}\s*=/gm)?.length ?? 0) >= 2;

const sqlDump = (body: string, ct: string) => notHtml(body, ct) && /(CREATE TABLE|INSERT INTO|-- MySQL dump|PostgreSQL database dump)/i.test(body);

export const SENSITIVE_PATHS: SensitivePath[] = [
  { path: "/.git/HEAD", kind: "git", match: (b, ct) => notHtml(b, ct) && /^ref: refs\//.test(b.trim()) },
  { path: "/.git/config", kind: "git", match: (b, ct) => notHtml(b, ct) && /^\[core\]/m.test(b) },
  { path: "/.svn/entries", kind: "vcs", match: (b, ct) => notHtml(b, ct) && /^(\d+\s*$|<\?xml)/m.test(b.trim()) && /svn|dir/i.test(b) },
  { path: "/.env", kind: "env", match: envFile },
  { path: "/.env.local", kind: "env", match: envFile },
  { path: "/.env.production", kind: "env", match: envFile },
  { path: "/backup.sql", kind: "dump", match: sqlDump },
  { path: "/dump.sql", kind: "dump", match: sqlDump },
  { path: "/database.sql", kind: "dump", match: sqlDump },
  { path: "/.htpasswd", kind: "credentials", match: (b, ct) => notHtml(b, ct) && /^[\w.-]+:\$(apr1|2[aby]|1|5|6)\$|^[\w.-]+:\{SHA\}/m.test(b) },
  { path: "/wp-config.php.bak", kind: "config", match: (b) => /DB_PASSWORD|define\(\s*['"]DB_/i.test(b) },
  { path: "/config.php.bak", kind: "config", match: (b) => /<\?php/i.test(b) && /(password|passwd|secret)/i.test(b) },
  { path: "/phpinfo.php", kind: "debug", match: (b) => /<title>phpinfo\(\)<\/title>|PHP Version \d/i.test(b) },
  { path: "/server-status", kind: "debug", match: (b) => /Apache Server Status for/i.test(b) },
  { path: "/.DS_Store", kind: "listing", match: (b) => b.includes("Bud1") },
];

export const SEVERE_KINDS = new Set<ExposedFile["kind"]>(["git", "vcs", "env", "dump", "credentials", "config"]);
