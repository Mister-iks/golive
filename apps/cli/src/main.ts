import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command, Option } from "commander";
import { COMMUNITY_PACKS, ENGINE_VERSION, evaluate, type Report } from "@golive/engine";
import { probe } from "@golive/probe";
import { scanRepo } from "@golive/scanner";
import { TEMPLATES, parseSpec, stringifySpec, validateSpec, type Spec } from "@golive/spec";
import { lang, tr } from "./i18n";
import { renderReport, renderIssues, c } from "./render";

const program = new Command()
  .name("golive")
  .description(tr("Checks that a project is ready for production and returns a Go / No-Go verdict.", "Vérifie qu'un projet est prêt pour la production et rend un verdict Go / No-Go."))
  .version(ENGINE_VERSION, "-v, --version", tr("output the version number", "affiche la version"))
  .helpOption("-h, --help", tr("display help for command", "affiche l'aide de la commande"))
  .helpCommand("help [command]", tr("display help for command", "affiche l'aide d'une commande"))
  // Read before commander runs (see i18n.ts); declared here so it is accepted and documented.
  .addOption(new Option("--lang <lang>", tr("language of the output (default: GOLIVE_LANG, then en)", "langue des messages (par défaut : GOLIVE_LANG, sinon en)")).choices(["en", "fr"]));

program
  .command("init")
  .description(tr("Creates a golive.yaml from a template", "Crée un golive.yaml à partir d'un modèle"))
  .addOption(new Option("-t, --template <id>", tr("template", "modèle")).choices(TEMPLATES.map((t) => t.id)).default("blank"))
  .option("-f, --force", tr("overwrite an existing golive.yaml", "écrase un golive.yaml existant"))
  .action((opts: { template: string; force?: boolean }) => {
    const file = resolve("golive.yaml");
    if (existsSync(file) && !opts.force) fatal(tr("golive.yaml already exists. Use --force to overwrite it.", "golive.yaml existe déjà. Utilisez --force pour l'écraser."));
    const tpl = TEMPLATES.find((t) => t.id === opts.template)!;
    const r = validateSpec(tpl.spec);
    if (!r.ok) fatal(tr("Invalid template.", "Modèle invalide."));
    writeFileSync(file, `# GoLive Spec. Documentation: https://github.com/Mister-iks/golive/blob/main/docs/spec.md\n${stringifySpec(r.spec)}`);
    console.log(`${c.green("✓")} ${tr(`golive.yaml created (${tpl.name}).`, `golive.yaml créé (${tpl.name}).`)}`);
    console.log(c.dim(tr("  Next, run: golive check", "  Lancez ensuite : golive check")));
  });

program
  .command("check", { isDefault: true })
  .description(tr("Evaluates the project and exits with an error if the verdict is No-Go", "Évalue le projet et sort en erreur si le verdict est No-Go"))
  .argument("[file]", tr("path to golive.yaml", "chemin du golive.yaml"), "golive.yaml")
  .option("-u, --url <url>", tr("also audit this URL (layer 3)", "audite aussi cette URL (couche 3)"))
  .option("-a, --audit", tr("audit the target declared in targets (prod, otherwise preprod)", "audite la cible déclarée dans targets (prod, sinon preprod)"))
  .option("-r, --repo [path]", tr("also scan the code repository (layer 2: secrets, dependencies, containers)", "analyse aussi le dépôt de code (couche 2 : secrets, dépendances, conteneurs)"))
  .option("--offline", tr("do not query the online vulnerability database (osv.dev)", "n'interroge pas la base de vulnérabilités en ligne (osv.dev)"))
  .addOption(new Option("-e, --env <env>", tr("environment of the audited URL", "environnement de l'URL auditée")).choices(["prod", "preprod"]))
  .addOption(new Option("--format <format>", tr("output format", "format de sortie")).choices(["pretty", "json", "markdown"]).default("pretty"))
  .option("-o, --output <file>", tr("also write the JSON report to this file", "écrit aussi le rapport JSON dans ce fichier"))
  .option("--as-of <date>", tr("reference date YYYY-MM-DD (makes the verdict replayable)", "date de référence AAAA-MM-JJ (rend le verdict rejouable)"))
  .addOption(new Option("--fail-on <level>", tr("verdict that makes the command fail", "niveau qui fait échouer la commande")).choices(["no-go", "conditional", "never"]).default("no-go"))
  .option("--allow-private", tr("allow auditing private addresses (internal pre-production)", "autorise l'audit d'adresses privées (pré-production interne)"))
  .option("--all", tr("also show passed checks", "affiche aussi les contrôles réussis"))
  .action(async (file: string, opts: CheckOptions) => {
    const spec = loadSpec(file);
    let web;
    const target = opts.url ?? (opts.audit ? spec.targets.prod ?? spec.targets.preprod : undefined);
    if (opts.audit && !target) fatal(tr("No target declared in targets.prod or targets.preprod.", "Aucune cible déclarée dans targets.prod ou targets.preprod."));
    if (target) {
      const env = opts.env ?? (target === spec.targets.preprod ? "preprod" : "prod");
      if (opts.format === "pretty") process.stderr.write(c.dim(tr(`Passive audit of ${target}…\n`, `Audit passif de ${target}…\n`)));
      // --offline also skips the public registry lookup of the site address (RDAP).
      web = await probe(target, { env, allowPrivate: opts.allowPrivate || process.env.GOLIVE_ALLOW_PRIVATE === "1", network: !opts.offline });
    }
    let repo;
    if (opts.repo) {
      const path = opts.repo === true ? "." : opts.repo;
      if (opts.format === "pretty") process.stderr.write(c.dim(tr(`Scanning repository ${path}…\n`, `Analyse du dépôt ${path}…\n`)));
      repo = await scanRepo(path, { offline: opts.offline });
    }
    const report = evaluate(spec, { asOf: opts.asOf, repo, web, lang });

    if (opts.output) writeFileSync(opts.output, JSON.stringify(report, null, 2));
    if (opts.format === "json") console.log(JSON.stringify(report, null, 2));
    else if (opts.format === "markdown") console.log(toMarkdown(report));
    else console.log(renderReport(report, { all: !!opts.all }));

    process.exitCode = exitCode(report, opts.failOn);
  });

program
  .command("validate")
  .description(tr("Only checks the syntax and consistency of golive.yaml", "Vérifie uniquement la syntaxe et la cohérence du golive.yaml"))
  .argument("[file]", tr("path to golive.yaml", "chemin du golive.yaml"), "golive.yaml")
  .action((file: string) => {
    loadSpec(file);
    console.log(`${c.green("✓")} ${tr(`${file} is a valid GoLive Spec.`, `${file} est un GoLive Spec valide.`)}`);
  });

program
  .command("rules")
  .description(tr("Lists the rules of the community packs", "Liste les règles des packs communautaires"))
  .option("-p, --pack <id>", tr("a single pack", "un seul pack"))
  .action((opts: { pack?: string }) => {
    for (const pack of COMMUNITY_PACKS) {
      if (opts.pack && pack.id !== opts.pack) continue;
      const name = (lang === "fr" && pack.fr?.name) || pack.name;
      console.log(`\n${c.bold(name)} ${c.dim(`${pack.id}@${pack.version}`)}`);
      for (const r of pack.rules) {
        const sev = typeof r.severity === "string" ? r.severity : "variable";
        const title = (lang === "fr" && r.fr?.title) || r.title;
        console.log(`  ${c.dim(r.id.padEnd(34))} ${title} ${c.dim(`· ${tr("layer", "couche")} ${r.layer} · ${sev}`)}`);
      }
    }
  });

program
  .command("templates")
  .description(tr("Lists the architecture templates", "Liste les modèles d'architecture"))
  .action(() => {
    for (const t of TEMPLATES) console.log(`  ${c.bold(t.id.padEnd(22))} ${t.description}`);
  });

interface CheckOptions {
  url?: string;
  audit?: boolean;
  repo?: string | true;
  offline?: boolean;
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
  if (!existsSync(path)) fatal(tr(`${file} not found. Create one with: golive init`, `${file} introuvable. Créez-en un avec : golive init`), 2);
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
  const label = { go: "GO", conditional: tr("CONDITIONAL GO", "GO CONDITIONNEL"), "no-go": "NO-GO" }[r.verdict.decision];
  const lines = [
    `## PcyBox GoLive : ${label} · score ${r.score.global}/100`,
    "",
    r.verdict.reasons.map((x) => `- ${x}`).join("\n"),
    "",
    tr("| Status | Severity | Rule | Finding |", "| Statut | Sévérité | Règle | Constat |"),
    "| --- | --- | --- | --- |",
    ...r.results
      .filter((x) => x.status === "fail" || x.status === "evidence" || x.status === "warn")
      .map((x) => `| ${x.status} | ${x.severity} | \`${x.ruleId}\` ${x.title} | ${x.findings.filter((f) => f.status !== "pass").map((f) => f.message).join("<br>")} |`),
    "",
    `<sub>${tr("Fingerprint", "Empreinte")} ${r.fingerprint} · ${tr("engine", "moteur")} ${r.engine} · ${r.asOf}</sub>`,
  ];
  return lines.join("\n");
}

function fatal(message: string, code = 2): never {
  console.error(`${c.red("✕")} ${message}`);
  process.exit(code);
}

program.parseAsync().catch((e: Error) => fatal(e.message));
