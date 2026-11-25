import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SecretFinding } from "@golive/packs-sdk";
import { basename, sizeOf } from "./files";

interface Pattern {
  rule: string;
  description: string;
  re: RegExp;
  /** Optional check on the captured value to drop placeholders. */
  accept?: (m: RegExpExecArray) => boolean;
}

const DEV_DEFAULT = /^(postgres|postgresql|root|admin|mysql|mariadb|mongo|mongodb|redis|guest|pass|pass123|password123|local|localdev|devpass)$/i;

const PLACEHOLDER = /^(x+|\*+|\.+|changeme|change-me|password|passwd|secret|example|your[_-].*|<.*>|\$\{.*\}|\{\{.*\}\}|%.*%|todo|null|none|test|dummy|redacted)$/i;

/**
 * High-precision patterns: each one matches a format that is a real credential
 * by construction, so a match is worth blocking a release.
 */
const PATTERNS: Pattern[] = [
  { rule: "private-key", description: "Private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { rule: "aws-access-key", description: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { rule: "github-token", description: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { rule: "gitlab-token", description: "GitLab token", re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { rule: "stripe-live-key", description: "Stripe live key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { rule: "slack-token", description: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "slack-webhook", description: "Slack webhook", re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]{20,}/ },
  { rule: "google-api-key", description: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { rule: "anthropic-key", description: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/ },
  { rule: "openai-key", description: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20}T3BlbkFJ[A-Za-z0-9_-]{20,}\b/ },
  { rule: "sendgrid-key", description: "SendGrid key", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  {
    rule: "database-url-password",
    description: "Database URL with a password",
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/([^:\s/@"'`]+):([^@\s"'`]{4,})@[^\s"'`]+/,
    // Development conventions are not secrets: a password equal to the user name ("golive:golive") or a default one ("postgres").
    accept: (m) => {
      const user = m[1] ?? "";
      const pass = m[2] ?? "";
      return !PLACEHOLDER.test(pass) && !/[$<{%]/.test(pass) && pass.toLowerCase() !== user.toLowerCase() && !DEV_DEFAULT.test(pass);
    },
  },
];

const ENV_KEY = /^\s*(?:export\s+)?([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*["']?([^"'\s#]+)/;
const ALLOW = /golive:allow|gitleaks:allow/;
const MAX_BYTES = 1_000_000;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp4|mp3|wasm|lock|min\.js|map)$/i;
const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "composer.lock", "poetry.lock", "Cargo.lock", "Gemfile.lock", "go.sum"]);

/** `.env`, `.env.production`… but not `.env.example` and friends. */
export function isEnvFile(file: string) {
  const name = basename(file);
  return /^\.env(\..+)?$/.test(name) && !/\.(example|sample|template|dist|defaults?)$/.test(name);
}

export function scanSecrets(root: string, files: string[], tracked: Set<string>): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const file of files) {
    const name = basename(file);
    if (LOCKFILES.has(name) || SKIP_EXT.test(name)) continue;
    const abs = join(root, file);
    if (sizeOf(abs) > MAX_BYTES) continue;

    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue; // binary

    const env = isEnvFile(file);
    if (env && tracked.has(file)) {
      out.push({ file, line: 1, rule: "env-file-committed", description: "Environment file committed to the repository" });
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.length > 4000 || ALLOW.test(line)) return;
      for (const p of PATTERNS) {
        const m = p.re.exec(line);
        if (m && (!p.accept || p.accept(m))) {
          out.push({ file, line: i + 1, rule: p.rule, description: p.description });
          return;
        }
      }
      if (env) {
        const m = ENV_KEY.exec(line);
        if (m && !PLACEHOLDER.test(m[2] ?? "") && (m[2]?.length ?? 0) >= 8) {
          out.push({ file, line: i + 1, rule: "env-secret", description: `Plain-text value of ${m[1]}` });
        }
      }
    });
  }
  return out;
}

export { PATTERNS as SECRET_PATTERNS };
