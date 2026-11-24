import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command, Option } from "commander";
import { COMMUNITY_PACKS, ENGINE_VERSION, evaluate, type Report } from "@golive/engine";
import { probe } from "@golive/probe";
import { TEMPLATES, parseSpec, stringifySpec, validateSpec, type Spec } from "@golive/spec";
import { renderReport, renderIssues, c } from "./render";

const program = new Command()
  .name("golive")
  .description("Vérifie qu'un projet est prêt pour la production et rend un verdict Go / No-Go.")
  .version(ENGINE_VERSION, "-v, --version");

program
  .command("init")
  .description("Crée un golive.yaml à partir d'un modèle")
  .addOption(new Option("-t, --template <id>", "modèle").choices(TEMPLATES.map((t) => t.id)).default("blank"))
  .option("-f, --force", "écrase un golive.yaml existant")
  .action((opts: { template: string; force?: boolean }) => {
    const file = resolve("golive.yaml");
    if (existsSync(file) && !opts.force) fatal("golive.yaml existe déjà. Utilisez --force pour l'écraser.");
    const tpl = TEMPLATES.find((t) => t.id === opts.template)!;
    const r = validateSpec(tpl.spec);
    if (!r.ok) fatal("Modèle invalide.");
    writeFileSync(file, `# GoLive Spec. Documentation : https://github.com/Mister-iks/golive/blob/main/docs/spec.md\n${stringifySpec(r.spec)}`);
    console.log(`${c.green("✓")} golive.yaml créé (${tpl.name}).`);
    console.log(c.dim("  Lancez ensuite : golive check"));
  });

program
  .command("check", { isDefault: true })
  .description("Évalue le projet et sort en erreur si le verdict est No-Go")
  .argument("[file]", "chemin du golive.yaml", "golive.yaml")
  .option("-u, --url <url>", "audite aussi cette URL (couche 3)")
  .option("-a, --audit", "audite la cible déclarée dans targets (prod, sinon preprod)")
  .addOption(new Option("-e, --env <env>", "environnement de l'URL auditée").choices(["prod", "preprod"]))
  .addOption(new Option("--format <format>", "format de sortie").choices(["pretty", "json", "markdown"]).default("pretty"))
  .option("-o, --output <file>", "écrit aussi le rapport JSON dans ce fichier")
  .option("--as-of <date>", "date de référence AAAA-MM-JJ (rend le verdict rejouable)")
  .addOption(new Option("--fail-on <level>", "niveau qui fait échouer la commande").choices(["no-go", "conditional", "never"]).default("no-go"))
  .option("--allow-private", "autorise l'audit d'adresses privées (pré-production interne)")
  .option("--all", "affiche aussi les contrôles réussis")
  .action(async (file: string, opts: CheckOptions) => {
    const spec = loadSpec(file);
    let web;
    const target = opts.url ?? (opts.audit ? spec.targets.prod ?? spec.targets.preprod : undefined);
    if (opts.audit && !target) fatal("Aucune cible déclarée dans targets.prod ou targets.preprod.");
    if (target) {
      const env = opts.env ?? (target === spec.targets.preprod ? "preprod" : "prod");
      if (opts.format === "pretty") process.stderr.write(c.dim(`Audit passif de ${target}…\n`));
      web = await probe(target, { env, allowPrivate: opts.allowPrivate || process.env.GOLIVE_ALLOW_PRIVATE === "1" });
    }
    const report = evaluate(spec, { asOf: opts.asOf, web });

    if (opts.output) writeFileSync(opts.output, JSON.stringify(report, null, 2));
    if (opts.format === "json") console.log(JSON.stringify(report, null, 2));
    else if (opts.format === "markdown") console.log(toMarkdown(report));
    else console.log(renderReport(report, { all: !!opts.all }));

    process.exitCode = exitCode(report, opts.failOn);
  });

program
  .command("validate")
  .description("Vérifie uniquement la syntaxe et la cohérence du golive.yaml")
  .argument("[file]", "chemin du golive.yaml", "golive.yaml")
  .action((file: string) => {
    loadSpec(file);
    console.log(`${c.green("✓")} ${file} est un GoLive Spec valide.`);
  });

program
  .command("rules")
  .description("Liste les règles des packs communautaires")
  .option("-p, --pack <id>", "un seul pack")
  .action((opts: { pack?: string }) => {
    for (const pack of COMMUNITY_PACKS) {
      if (opts.pack && pack.id !== opts.pack) continue;
      console.log(`\n${c.bold(pack.name)} ${c.dim(`${pack.id}@${pack.version}`)}`);
      for (const r of pack.rules) {
        const sev = typeof r.severity === "string" ? r.severity : "variable";
        console.log(`  ${c.dim(r.id.padEnd(34))} ${r.title} ${c.dim(`· couche ${r.layer} · ${sev}`)}`);
      }
    }
  });

program
  .command("templates")
  .description("Liste les modèles d'architecture")
  .action(() => {
    for (const t of TEMPLATES) console.log(`  ${c.bold(t.id.padEnd(22))} ${t.description}`);
  });

interface CheckOptions {
  url?: string;
  audit?: boolean;
  env?: "prod" | "preprod";
  format: "pretty" | "json" | "markdown";
  output?: string;
  asOf?: string;
  failOn: "no-go" | "conditional" | "never";
  allowPrivate?: boolean;
  all?: boolean;
}

function loadSpec(file: string): Spec {
  const path = resolve(file);
  if (!existsSync(path)) fatal(`${file} introuvable. Créez-en un avec : golive init`, 2);
  const parsed = parseSpec(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    console.error(renderIssues(file, parsed.issues));
    process.exit(2);
  }
  return parsed.spec;
}

function exitCode(report: Report, failOn: CheckOptions["failOn"]) {
  if (failOn === "never") return 0;
  if (report.verdict.decision === "no-go") return 1;
  if (report.verdict.decision === "conditional" && failOn === "conditional") return 1;
  return 0;
}

function toMarkdown(r: Report) {
  const label = { go: "GO", conditional: "GO CONDITIONNEL", "no-go": "NO-GO" }[r.verdict.decision];
  const lines = [
    `## GoLive : ${label} · score ${r.score.global}/100`,
    "",
    r.verdict.reasons.map((x) => `- ${x}`).join("\n"),
    "",
    "| Statut | Sévérité | Règle | Constat |",
    "| --- | --- | --- | --- |",
    ...r.results
      .filter((x) => x.status === "fail" || x.status === "evidence" || x.status === "warn")
      .map((x) => `| ${x.status} | ${x.severity} | \`${x.ruleId}\` ${x.title} | ${x.findings.filter((f) => f.status !== "pass").map((f) => f.message).join("<br>")} |`),
    "",
    `<sub>Empreinte ${r.fingerprint} · moteur ${r.engine} · ${r.asOf}</sub>`,
  ];
  return lines.join("\n");
}

function fatal(message: string, code = 2): never {
  console.error(`${c.red("✕")} ${message}`);
  process.exit(code);
}

program.parseAsync().catch((e: Error) => fatal(e.message));
