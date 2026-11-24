import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { RepoObservation, ScanTool, SecretFinding } from "@golive/packs-sdk";
import { isComposeFile, isDockerfile, scanContainers } from "./containers";
import { collectPackages, lookupVulnerabilities } from "./deps";
import { listFiles } from "./files";
import { scanSecrets } from "./secrets";

export { checkCompose, checkDockerfile } from "./containers";
export { collectPackages, lookupVulnerabilities } from "./deps";
export { isEnvFile, scanSecrets } from "./secrets";

export interface ScanOptions {
  /** Skip the online vulnerability lookup (osv.dev). */
  offline?: boolean;
  /** Use Gitleaks when it is installed (default: true). */
  gitleaks?: boolean;
}

/**
 * Static scan of a repository. Reads files only, never executes project code.
 * Secret values are never returned, only their location and kind.
 */
export async function scanRepo(path: string, options: ScanOptions = {}): Promise<RepoObservation> {
  const root = resolve(path);
  const { files, tracked } = listFiles(root);
  const tools: ScanTool[] = [{ name: "golive-secrets", used: true }];

  let secrets = scanSecrets(root, files, tracked);
  if (options.gitleaks !== false) {
    const gl = runGitleaks(root);
    tools.push(gl.tool);
    secrets = mergeSecrets(secrets, gl.findings);
  }

  const { packages, manifests } = collectPackages(root, files);
  const dependencies: RepoObservation["dependencies"] = { checked: false, manifests, vulnerabilities: [] };
  if (options.offline) {
    dependencies.error = "Analyse hors ligne : vulnérabilités non vérifiées.";
    tools.push({ name: "osv.dev", used: false, note: "hors ligne" });
  } else if (packages.length === 0) {
    dependencies.checked = true;
    tools.push({ name: "osv.dev", used: false, note: "aucun lockfile" });
  } else {
    try {
      dependencies.vulnerabilities = await lookupVulnerabilities(packages);
      dependencies.checked = true;
      tools.push({ name: "osv.dev", used: true, note: `${packages.length} paquets` });
    } catch (e) {
      dependencies.error = `Base OSV injoignable : ${(e as Error).message}`;
      tools.push({ name: "osv.dev", used: false, note: "injoignable" });
    }
  }

  return {
    root: path,
    scannedAt: new Date().toISOString(),
    files: files.length,
    tools,
    secrets,
    dependencies,
    containerFiles: files.filter((f) => isDockerfile(f) || isComposeFile(f)),
    containers: scanContainers(root, files),
  };
}

function runGitleaks(root: string): { tool: ScanTool; findings: SecretFinding[] } {
  let version: string;
  try {
    version = execFileSync("gitleaks", ["version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return { tool: { name: "gitleaks", used: false, note: "non installé" }, findings: [] };
  }
  const dir = mkdtempSync(join(tmpdir(), "golive-gitleaks-"));
  const report = join(dir, "report.json");
  try {
    execFileSync("gitleaks", ["dir", root, "--report-format", "json", "--report-path", report, "--redact", "--no-banner", "--exit-code", "0"], {
      stdio: "ignore",
      timeout: 120_000,
    });
    const raw = JSON.parse(readFileSync(report, "utf8")) as { File: string; StartLine: number; RuleID: string; Description: string }[];
    const findings = raw.map((f) => ({
      file: (isAbsolute(f.File) ? relative(root, f.File) : f.File).split(sep).join("/"),
      line: f.StartLine,
      rule: `gitleaks:${f.RuleID}`,
      description: f.Description,
    }));
    return { tool: { name: "gitleaks", version, used: true }, findings };
  } catch {
    return { tool: { name: "gitleaks", version, used: false, note: "échec de l'analyse" }, findings: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mergeSecrets(a: SecretFinding[], b: SecretFinding[]) {
  const seen = new Set(a.map((f) => `${f.file}:${f.line}`));
  return [...a, ...b.filter((f) => !seen.has(`${f.file}:${f.line}`))].sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
}
