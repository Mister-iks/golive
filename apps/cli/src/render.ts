import pc from "picocolors";
import { CATEGORY_LABELS, type Report } from "@golive/engine";
import type { Severity, Status } from "@golive/packs-sdk";
import type { SpecIssue } from "@golive/spec";

export const c = pc;

const SEV_LABEL: Record<Severity, string> = { blocker: "BLOQUANT", major: "MAJEUR", minor: "MINEUR", info: "INFO" };
const SEV_COLOR: Record<Severity, (s: string) => string> = { blocker: pc.red, major: pc.yellow, minor: pc.cyan, info: pc.dim };
const STATUS_ICON: Record<Status, string> = {
  fail: pc.red("✕"),
  evidence: pc.yellow("◇"),
  warn: pc.yellow("!"),
  pass: pc.green("✓"),
  na: pc.dim("·"),
  "not-run": pc.dim("○"),
};

export function renderReport(r: Report, opts: { all: boolean }): string {
  const out: string[] = [];
  const d = r.verdict.decision;
  const badge =
    d === "go" ? pc.bgGreen(pc.black(pc.bold("  GO  "))) : d === "conditional" ? pc.bgYellow(pc.black(pc.bold("  GO CONDITIONNEL  "))) : pc.bgRed(pc.white(pc.bold("  NO-GO  ")));

  out.push("");
  out.push(`${badge}  ${pc.bold(r.project.name)}  ${pc.dim(`score ${r.score.global}/100 · seuil ${r.threshold}`)}`);
  for (const reason of r.verdict.reasons) out.push(`${pc.dim("│")} ${reason}`);
  out.push("");

  const sevRank = { blocker: 0, major: 1, minor: 2, info: 3 };
  const bySeverity = <T extends { severity: Severity }>(a: T, b: T) => sevRank[a.severity] - sevRank[b.severity];

  // 1. Failures and warnings: full detail with the fix.
  const problems = r.results
    .filter((x) => x.status === "fail" || x.status === "warn" || (opts.all && x.status === "pass"))
    .sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1) || bySeverity(a, b));
  for (const x of problems) {
    const sev = SEV_COLOR[x.severity](SEV_LABEL[x.severity].padEnd(8));
    const waived = x.waiver ? pc.dim(` (dérogation jusqu'au ${x.waiver.expires})`) : "";
    out.push(`${STATUS_ICON[x.status]} ${sev} ${pc.bold(x.title)} ${pc.dim(x.ruleId)}${waived}`);
    for (const f of x.findings.filter((f) => f.status !== "pass" || opts.all)) out.push(`    ${f.message}`);
    if (x.status !== "pass") out.push(`    ${pc.dim("→ " + x.fix)}`);
    out.push("");
  }

  // 2. Proofs to provide: one line each.
  const proofs = r.results.filter((x) => x.status === "evidence").sort(bySeverity);
  if (proofs.length) {
    out.push(pc.bold(`Preuves à fournir (${proofs.length})`) + pc.dim("  à attester dans la section evidence du golive.yaml"));
    for (const x of proofs) {
      const waived = x.waiver ? pc.dim(" (dérogation)") : "";
      out.push(`${STATUS_ICON.evidence} ${SEV_COLOR[x.severity](SEV_LABEL[x.severity].padEnd(8))} ${x.title} ${pc.dim(x.ruleId)}${waived}`);
    }
    out.push("");
  }

  const cats = Object.entries(r.score.byCategory)
    .map(([k, v]) => `${CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS]} ${scoreColor(v!)}`)
    .join(pc.dim("  ·  "));
  out.push(cats);
  out.push(
    pc.dim(
      `${r.counts.pass} ok · ${r.counts.fail} échecs · ${r.counts.evidence} preuves requises · ${r.counts.warn} avertissements · ${r.counts["not-run"]} non exécutés`,
    ),
  );
  const stale = r.packs.filter((p) => p.stale);
  if (stale.length) out.push(pc.yellow(`! Packs légaux sans revue juridique récente : ${stale.map((p) => p.name).join(", ")}. À valider par un juriste.`));
  if (r.coverage.repo) out.push(pc.dim(`✓ Dépôt analysé : ${r.coverage.repo.files} fichiers (${r.coverage.repo.tools.join(", ")}).`));
  else out.push(pc.dim("○ Dépôt non analysé. Ajoutez --repo pour la couche 2."));
  if (!r.coverage.layers.includes(3)) out.push(pc.dim("○ Site non audité. Ajoutez --url <url> ou --audit pour la couche 3."));
  out.push(pc.dim(`Empreinte ${r.fingerprint} · moteur ${r.engine} · référence ${r.asOf} · rapport local non signé`));
  return out.join("\n");
}

function scoreColor(v: number) {
  const s = String(v);
  return v >= 80 ? pc.green(s) : v >= 60 ? pc.yellow(s) : pc.red(s);
}

export function renderIssues(file: string, issues: SpecIssue[]): string {
  return [
    `${pc.red("✕")} ${pc.bold(file)} n'est pas un GoLive Spec valide :`,
    ...issues.map((i) => {
      const where = i.line ? pc.dim(`${file}:${i.line}${i.column ? `:${i.column}` : ""}`) : "";
      const path = i.path.length ? pc.cyan(i.path.join(".")) + " " : "";
      return `  ${where} ${path}${i.message}`;
    }),
  ].join("\n");
}
