import { ENCRYPTED_PROTOCOLS, EOL, EOL_SNAPSHOT, TECH_ALIASES, eolDate, parseTech, type Component } from "@golive/spec";
import {
  dataStores,
  definePack,
  defineRule,
  fail,
  isCritical,
  na,
  pass,
  tr,
  warn,
  type Finding,
  type Lang,
} from "@golive/packs-sdk";
import { daysBetween, isLocalFile, list, pathOf, plural, withCrawl, withRepo, withWeb } from "./util";

const ENDOFLIFE = { label: "endoflife.date", url: "https://endoflife.date" };

export const core = definePack({
  id: "golive-core",
  name: "PcyBox GoLive core",
  version: "0.1.0",
  description: "Architecture, technologies and baseline quality of any project going live.",
  maintainer: "PcyBox GoLive",
  core: true,
  fr: { name: "Socle PcyBox GoLive", description: "Architecture, technologies et qualité de base de tout projet mis en ligne." },
  rules: [
    defineRule({
      id: "core.arch.datastore-private",
      title: "No data store exposed to the Internet",
      why: "A database, cache or queue reachable from the Internet is the leading cause of massive data leaks.",
      layer: 1,
      category: "architecture",
      severity: "blocker",
      method: "auto",
      source: { label: "OWASP Top 10 A05: Security Misconfiguration", url: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/" },
      fix: "Put the data store in a private network and expose it only to application services. Use an API for any external access.",
      fr: {
        title: "Aucun stockage de données exposé sur Internet",
        why: "Une base, un cache ou une file joignable depuis Internet est la première cause de fuite massive de données.",
        fix: "Placez le stockage dans un réseau privé et ne l'exposez qu'aux services applicatifs. Passez par une API pour tout accès externe.",
      },
      applies: (ctx) => dataStores(ctx).length > 0,
      check: (ctx) =>
        dataStores(ctx).map((c) => {
          const name = ctx.graph.label(c.id);
          return ctx.graph.exposure(c) === "public"
            ? fail(tr(ctx, `${name} is reachable from the Internet.`, `${name} est joignable depuis Internet.`), { target: c.id, observed: "exposure: public" })
            : pass(tr(ctx, `${name} is in a private network.`, `${name} est dans un réseau privé.`), { target: c.id });
        }),
    }),

    defineRule({
      id: "core.arch.encrypted-links",
      title: "All traffic is encrypted",
      why: "A plaintext flow can be read or altered by anyone on the network path, including at the hosting provider.",
      layer: 1,
      category: "architecture",
      severity: "major",
      method: "auto",
      source: { label: "OWASP ASVS: Secure Communication", url: "https://owasp.org/www-project-application-security-verification-standard/" },
      fix: "Use the encrypted variant of the protocol (https, postgres-tls, rediss, amqps, smtps…) and verify certificates on the client side.",
      fr: {
        title: "Tous les échanges sont chiffrés",
        why: "Un flux en clair peut être lu ou modifié par quiconque se trouve sur le chemin réseau, y compris chez l'hébergeur.",
        fix: "Utilisez la variante chiffrée du protocole (https, postgres-tls, rediss, amqps, smtps…) et vérifiez les certificats côté client.",
      },
      applies: (ctx) => ctx.spec.links.some((l) => l.protocol !== "internal"),
      check: (ctx) => {
        const out: Finding[] = [];
        for (const l of ctx.spec.links) {
          if (l.protocol === "internal") continue;
          const id = `${l.from}->${l.to}`;
          const name = `${ctx.graph.label(l.from)} → ${ctx.graph.label(l.to)}`;
          if (ENCRYPTED_PROTOCOLS.has(l.protocol)) continue;
          const fromActor = ctx.graph.isActor(l.from);
          const carriesPersonal = l.sensitivity === "personal" || l.sensitivity === "sensitive";
          const a = ctx.graph.byId.get(l.from);
          const b = ctx.graph.byId.get(l.to);
          const crossesSite =
            !!a && !!b && (ctx.graph.country(a) !== ctx.graph.country(b) || ctx.graph.provider(a) !== ctx.graph.provider(b));
          const severity = fromActor || carriesPersonal || crossesSite ? "blocker" : "major";
          out.push(fail(tr(ctx, `${name} uses plaintext ${l.protocol}.`, `${name} utilise ${l.protocol} en clair.`), { target: id, observed: l.protocol, severity }));
        }
        return out.length ? out : pass(tr(ctx, "All declared links use an encrypted protocol.", "Tous les liens déclarés utilisent un protocole chiffré."));
      },
    }),

    defineRule({
      id: "core.arch.backup",
      title: "Data is backed up",
      why: "Without an off-site backup, a mistake, ransomware or a disk failure wipes out the service for good.",
      layer: 1,
      category: "operations",
      severity: "blocker",
      method: "auto",
      source: { label: "ANSSI, IT hygiene guide, measure 37", url: "https://cyber.gouv.fr/publications/guide-dhygiene-informatique" },
      fix: "Add a \"Backup\" component linked to every database and storage, hosted away from the original data.",
      fr: {
        title: "Les données sont sauvegardées",
        why: "Sans sauvegarde externalisée, une erreur, un rançongiciel ou une panne disque efface définitivement le service.",
        fix: "Ajoutez un composant « Sauvegarde » relié à chaque base et stockage, hébergé ailleurs que la donnée d'origine.",
        source: "ANSSI, guide d'hygiène informatique, mesure 37",
      },
      applies: (ctx) => ctx.graph.has("database", "storage"),
      check: (ctx) => {
        const stores = ctx.graph.ofKind("database", "storage");
        const backups = ctx.graph.ofKind("backup");
        if (backups.length === 0) return fail(tr(ctx, "No backup component in the architecture.", "Aucun composant de sauvegarde dans l'architecture."));
        return stores.map((s) => {
          const name = ctx.graph.label(s.id);
          return backups.some((b) => ctx.graph.linked(b.id, s.id))
            ? pass(tr(ctx, `${name} is backed up.`, `${name} est sauvegardé.`), { target: s.id })
            : fail(tr(ctx, `${name} is not linked to any backup.`, `${name} n'est relié à aucune sauvegarde.`), { target: s.id, severity: "major" });
        });
      },
    }),

    defineRule({
      id: "core.arch.monitoring",
      title: "The service is monitored",
      why: "Without monitoring, your users discover outages, often hours later.",
      layer: 1,
      category: "operations",
      severity: "major",
      method: "auto",
      source: { label: "Google SRE Book, Monitoring Distributed Systems", url: "https://sre.google/sre-book/monitoring-distributed-systems/" },
      fix: "Add monitoring (availability, errors, latency) with alerts sent to a person.",
      fr: {
        title: "Le service est supervisé",
        why: "Sans supervision, ce sont vos utilisateurs qui découvrent les pannes, souvent des heures après.",
        fix: "Ajoutez une supervision (disponibilité, erreurs, latence) avec des alertes envoyées à une personne.",
      },
      check: (ctx) =>
        ctx.graph.has("monitoring")
          ? pass(tr(ctx, "A monitoring component is declared.", "Un composant de supervision est déclaré."))
          : fail(tr(ctx, "No monitoring declared.", "Aucune supervision déclarée.")),
    }),

    defineRule({
      id: "core.arch.logging",
      title: "Logs are centralized",
      why: "After an incident, centralized and retained logs are the only way to understand what happened.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "auto",
      source: { label: "OWASP Logging Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html" },
      fix: "Send application logs to a central service with a defined retention period.",
      fr: {
        title: "Les journaux sont centralisés",
        why: "En cas d'incident, des journaux centralisés et conservés sont la seule façon de comprendre ce qui s'est passé.",
        fix: "Envoyez les journaux applicatifs vers un service central avec une durée de conservation définie.",
      },
      applies: (ctx) => ctx.graph.has("backend", "api", "frontend"),
      check: (ctx) =>
        ctx.graph.has("logging", "monitoring")
          ? pass(tr(ctx, "Logs have a central destination.", "Les journaux ont une destination centrale."))
          : warn(tr(ctx, "No logging or monitoring component.", "Aucun composant de journalisation ni de supervision.")),
    }),

    defineRule({
      id: "core.arch.secrets",
      title: "Secrets are kept in a vault",
      why: "Plaintext keys in code or server variables end up sooner or later in a public repository or a backup.",
      layer: 1,
      category: "security",
      severity: (ctx) => (isCritical(ctx) ? "major" : "minor"),
      method: "auto",
      source: { label: "OWASP Secrets Management Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html" },
      fix: "Store passwords, API keys and certificates in a vault (Vault, OpenBao, Infisical, SOPS…) and inject them at startup.",
      fr: {
        title: "Les secrets sont dans un coffre",
        why: "Des clés en clair dans le code ou les variables d'un serveur finissent tôt ou tard dans un dépôt public ou une sauvegarde.",
        fix: "Stockez mots de passe, clés d'API et certificats dans un coffre (Vault, OpenBao, Infisical, SOPS…) et injectez-les au démarrage.",
      },
      applies: (ctx) => ctx.graph.has("backend", "api"),
      check: (ctx) =>
        ctx.graph.has("secrets")
          ? pass(tr(ctx, "A secrets vault is declared.", "Un coffre à secrets est déclaré."))
          : fail(tr(ctx, "No secrets vault declared.", "Aucun coffre à secrets déclaré.")),
    }),

    defineRule({
      id: "core.arch.edge",
      title: "Public traffic goes through a controlled entry point",
      why: "A CDN, web application firewall or reverse proxy absorbs spikes, filters common attacks and centralizes TLS.",
      layer: 1,
      category: "architecture",
      severity: "minor",
      method: "auto",
      source: { label: "OWASP Top 10 A05", url: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/" },
      fix: "Put a CDN, a WAF or a load balancer between the Internet and your application servers.",
      fr: {
        title: "Le trafic public passe par un point d'entrée maîtrisé",
        why: "Un CDN, un pare-feu applicatif ou un reverse proxy absorbe les pics, filtre les attaques courantes et centralise TLS.",
        fix: "Placez un CDN, un WAF ou un répartiteur de charge entre Internet et vos serveurs d'application.",
      },
      applies: (ctx) => ctx.spec.project.audience !== "internal" && ctx.graph.has("frontend", "api", "backend"),
      check: (ctx) => {
        if (ctx.graph.has("cdn", "waf", "load-balancer")) return pass(tr(ctx, "An entry point (CDN, WAF or proxy) is declared.", "Un point d'entrée (CDN, WAF ou proxy) est déclaré."));
        const direct = ctx.graph.ofKind("backend", "api").filter((c) => ctx.graph.exposure(c) === "public");
        const names = list(direct.map((c) => ctx.graph.label(c.id)));
        return warn(
          direct.length
            ? tr(ctx, `Application servers exposed directly: ${names}.`, `Serveurs applicatifs exposés directement : ${names}.`)
            : tr(ctx, "No CDN, WAF or reverse proxy in front of the application.", "Aucun CDN, WAF ni reverse proxy devant l'application."),
        );
      },
    }),

    defineRule({
      id: "core.arch.orphans",
      title: "Every component is connected",
      why: "An isolated component often signals something missing from the diagram, so a flow nobody analyzed.",
      layer: 1,
      category: "architecture",
      severity: "info",
      method: "auto",
      source: { label: "GoLive Spec" },
      fix: "Link the component to the elements it exchanges with, or remove it from the diagram.",
      fr: {
        title: "Chaque composant est relié",
        why: "Un composant isolé signale souvent un oubli dans le schéma, donc un flux non analysé.",
        fix: "Reliez le composant aux éléments avec lesquels il échange, ou retirez-le du schéma.",
      },
      applies: (ctx) => ctx.spec.components.length > 1,
      check: (ctx) => {
        const orphans = ctx.spec.components.filter((c) => ctx.graph.linksFrom(c.id).length + ctx.graph.linksTo(c.id).length === 0);
        return orphans.length
          ? orphans.map((c) => {
              const name = ctx.graph.label(c.id);
              return warn(tr(ctx, `${name} is not connected to anything.`, `${name} n'est relié à rien.`), { target: c.id });
            })
          : pass(tr(ctx, "All components are connected.", "Tous les composants sont reliés."));
      },
    }),

    defineRule({
      id: "core.tech.eol",
      title: "No end-of-life technology",
      why: "A version that no longer gets security fixes piles up known, published vulnerabilities.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: `endoflife.date (snapshot of ${EOL_SNAPSHOT})`, url: ENDOFLIFE.url },
      fix: "Plan the upgrade to a still-supported version before going live.",
      fr: {
        title: "Aucune technologie en fin de vie",
        why: "Une version qui ne reçoit plus de correctifs de sécurité accumule des failles connues et publiées.",
        fix: "Planifiez la montée vers une version encore maintenue avant la mise en ligne.",
        source: `endoflife.date (instantané du ${EOL_SNAPSHOT})`,
      },
      applies: (ctx) => ctx.spec.components.some((c) => techsOf(c).some((t) => !!t.version)),
      check: (ctx) => {
        const out: Finding[] = [];
        for (const c of ctx.spec.components) {
          for (const t of techsOf(c)) {
            const eol = eolDate(t.name, t.version);
            if (!eol) continue;
            const days = daysBetween(eol.date, ctx.asOf);
            const label = `${t.name} ${eol.cycle}`;
            const name = ctx.graph.label(c.id);
            if (days >= 0) {
              out.push(
                fail(tr(ctx, `${label} (${name}) has been unsupported since ${eol.date}.`, `${label} (${name}) n'est plus maintenu depuis le ${eol.date}.`), {
                  target: c.id,
                  observed: `${t.name}@${t.version}`,
                  severity: days > 365 ? "blocker" : "major",
                }),
              );
            } else if (days > -180) {
              out.push(
                warn(tr(ctx, `${label} (${name}) reaches end of life on ${eol.date}.`, `${label} (${name}) arrive en fin de vie le ${eol.date}.`), {
                  target: c.id,
                  observed: `${t.name}@${t.version}`,
                  severity: "minor",
                }),
              );
            } else {
              out.push(pass(tr(ctx, `${label} is supported until ${eol.date}.`, `${label} est maintenu jusqu'au ${eol.date}.`), { target: c.id }));
            }
          }
        }
        return out.length ? out : na(tr(ctx, "No declared version is listed in the end-of-life database.", "Aucune version déclarée n'est référencée dans la base de fin de vie."));
      },
    }),

    defineRule({
      id: "core.tech.versions",
      title: "Versions are declared",
      why: "Without a version, there is no way to know whether a technology is vulnerable or end of life.",
      layer: 1,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: ENDOFLIFE,
      fix: "Give the major version of each technology, for example postgresql@17 or nodejs@22.",
      fr: {
        title: "Les versions sont déclarées",
        why: "Sans version, impossible de savoir si une technologie est vulnérable ou en fin de vie.",
        fix: "Indiquez la version majeure de chaque technologie, par exemple postgresql@17 ou nodejs@22.",
      },
      applies: (ctx) => ctx.spec.components.some((c) => !!c.tech),
      check: (ctx) => {
        const missing = ctx.spec.components.filter((c) => {
          const t = parseTech(c.tech);
          return t && !t.version && eolKnown(t.name);
        });
        return missing.length
          ? missing.map((c) => {
              const name = ctx.graph.label(c.id);
              return warn(tr(ctx, `${name}: no version given for ${c.tech}.`, `${name} : version de ${c.tech} non précisée.`), { target: c.id });
            })
          : pass(tr(ctx, "Tracked technologies have a version.", "Les technologies suivies ont une version."));
      },
    }),

    /* ---------------------------------------------------------- layer 2 */

    defineRule({
      id: "core.drift.published-datastore",
      title: "No database published by deployment files",
      why: "A database port published by Docker often bypasses the host firewall: the architecture declared private no longer is.",
      layer: 2,
      category: "architecture",
      severity: "blocker",
      method: "auto",
      source: { label: "Docker, Packet filtering and firewalls", url: "https://docs.docker.com/engine/network/packet-filtering-firewalls/" },
      fix: "Remove the port publication, or bind it to 127.0.0.1 (127.0.0.1:5432:5432). Services reach each other through the compose internal network.",
      fr: {
        title: "Aucune base publiée par les fichiers de déploiement",
        why: "Un port de base de données publié par Docker contourne souvent le pare-feu de l'hôte : l'architecture déclarée privée ne l'est plus.",
        fix: "Retirez la publication du port, ou liez-le à 127.0.0.1 (127.0.0.1:5432:5432). Les services se joignent par le réseau interne de compose.",
      },
      check: (ctx) =>
        withRepo(ctx, (repo) => {
          const hits = repo.containers.filter((c) => c.check === "published-datastore");
          if (!hits.length) return pass(tr(ctx, "No data store published on the host.", "Aucun stockage de données publié sur l'hôte."));
          return hits.map((c) => {
            const local = isLocalFile(c.file);
            const declaredPrivate = dataStores(ctx).some((d) => ctx.graph.exposure(d) !== "public");
            const drift = declaredPrivate && !local ? tr(ctx, " Yet the architecture declares it private.", " L'architecture la déclare pourtant privée.") : "";
            return (local ? warn : fail)(`${c.message}${drift} (${c.file})`, { observed: c.subject, severity: local ? "minor" : "blocker" });
          });
        }),
    }),

    defineRule({
      id: "core.code.lockfiles",
      title: "Dependencies are locked",
      why: "Without a lockfile, two deployments of the same code can ship different, sometimes vulnerable, versions.",
      layer: 2,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: { label: "OpenSSF Scorecard, Pinned-Dependencies", url: "https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies" },
      fix: "Generate and commit the lockfile (package-lock.json, pnpm-lock.yaml, composer.lock, poetry.lock…).",
      fr: {
        title: "Dépendances verrouillées",
        why: "Sans lockfile, deux déploiements du même code peuvent embarquer des versions différentes, parfois vulnérables.",
        fix: "Générez et versionnez le lockfile (package-lock.json, pnpm-lock.yaml, composer.lock, poetry.lock…).",
      },
      check: (ctx) =>
        withRepo(ctx, (repo) => {
          const manifests = repo.dependencies.manifests;
          if (!manifests.length) return na(tr(ctx, "No dependency manager detected.", "Aucun gestionnaire de dépendances détecté."));
          const missing = manifests.filter((m) => !m.lockfile);
          const n = manifests.length;
          const s = n > 1 ? "s" : "";
          return missing.length
            ? missing.map((m) => warn(tr(ctx, `${m.file} has no lockfile.`, `${m.file} n'a pas de lockfile.`), { observed: m.ecosystem }))
            : pass(tr(ctx, `${n} lockfile${s} committed.`, `${n} lockfile${s} versionné${s}.`));
        }),
    }),

    /* ---------------------------------------------------------- layer 3 */

    defineRule({
      id: "core.web.reachable",
      title: "The site responds correctly",
      why: "The starting point of every check: the declared target must respond without error.",
      layer: 3,
      category: "quality",
      severity: "blocker",
      method: "auto",
      source: { label: "RFC 9110, HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110" },
      fix: "Check DNS, the certificate and the server configuration, then run the audit again.",
      fr: {
        title: "Le site répond correctement",
        why: "Le point de départ de toute vérification : la cible déclarée doit répondre sans erreur.",
        fix: "Vérifiez le DNS, le certificat et la configuration du serveur, puis relancez l'audit.",
      },
      applies: (ctx) => !!ctx.web,
      check: (ctx) => {
        const web = ctx.web!;
        if (!web.ok) return fail(web.error ?? tr(ctx, "The site does not respond.", "Le site ne répond pas."), { observed: web.url });
        if ((web.status ?? 0) >= 400) return fail(tr(ctx, `The site responds with status ${web.status}.`, `Le site répond avec le code ${web.status}.`), { observed: String(web.status) });
        return pass(tr(ctx, `Response ${web.status} in ${web.timing.totalMs} ms.`, `Réponse ${web.status} en ${web.timing.totalMs} ms.`), { observed: web.finalUrl });
      },
    }),

    defineRule({
      id: "core.web.indexing",
      title: "Indexing matches the environment",
      why: "A production site set to noindex is invisible in search engines; an indexable pre-production exposes a test site to the public.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: { label: "Google Search Central, noindex", url: "https://developers.google.com/search/docs/crawling-indexing/block-indexing" },
      fix: "In production, remove noindex (meta tag and X-Robots-Tag header). In pre-production, add it and protect access.",
      fr: {
        title: "L'indexation correspond à l'environnement",
        why: "Une production en noindex est invisible sur les moteurs ; une pré-production indexable expose un site de test au public.",
        fix: "En production, retirez le noindex (balise meta et en-tête X-Robots-Tag). En pré-production, ajoutez-le et protégez l'accès.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const robots = `${web.html?.robots ?? ""} ${web.headers["x-robots-tag"] ?? ""}`.toLowerCase();
          const noindex = robots.includes("noindex");
          if (web.env === "prod") {
            return noindex
              ? fail(tr(ctx, "Production asks search engines not to index it.", "La production demande aux moteurs de ne pas l'indexer."), { observed: robots.trim() })
              : pass(tr(ctx, "Production is indexable.", "La production est indexable."));
          }
          return noindex
            ? pass(tr(ctx, "Pre-production is excluded from search engines.", "La pré-production est exclue des moteurs."))
            : fail(tr(ctx, "Pre-production can be indexed by search engines.", "La pré-production est indexable par les moteurs de recherche."), { severity: "minor" });
        }),
    }),

    defineRule({
      id: "core.web.metadata",
      title: "Page title and description present",
      why: "They shape how the page appears in search results and link previews.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: { label: "Google Search Central, title links", url: "https://developers.google.com/search/docs/appearance/title-link" },
      fix: "Set a unique <title> tag and a meta description of 50 to 160 characters.",
      fr: {
        title: "Titre et description de page présents",
        why: "Ils conditionnent l'affichage dans les résultats de recherche et les aperçus de partage.",
        fix: "Renseignez une balise <title> unique et une meta description de 50 à 160 caractères.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const out: Finding[] = [];
          const title = web.html?.title?.trim();
          const desc = web.html?.metaDescription?.trim();
          out.push(
            title
              ? pass(tr(ctx, `Title: "${title}"`, `Titre : « ${title} »`))
              : fail(tr(ctx, "<title> tag missing or empty.", "Balise <title> absente ou vide.")),
          );
          out.push(desc ? pass(tr(ctx, "Meta description present.", "Meta description présente.")) : warn(tr(ctx, "Meta description missing.", "Meta description absente.")));
          return out;
        }),
    }),

    defineRule({
      id: "core.web.broken-links",
      title: "No broken internal links",
      why: "A page answering 404 or 500 from the navigation breaks the journey and hurts search ranking.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: { label: "RFC 9110, HTTP status codes", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15" },
      fix: "Fix or redirect (301) each listed link, then run the full audit again.",
      fr: {
        title: "Aucun lien interne cassé",
        why: "Une page qui répond 404 ou 500 depuis la navigation casse le parcours et dégrade le référencement.",
        fix: "Corrigez ou redirigez (301) chaque lien listé, puis relancez l'audit complet.",
        source: "RFC 9110, codes de statut HTTP",
      },
      check: (ctx) =>
        withCrawl(ctx, (crawl) => {
          const n = crawl.pages.length;
          if (!crawl.brokenLinks.length) {
            return pass(tr(ctx, `${plural(n, "page")} browsed, no broken link.`, `${plural(n, "page")} parcourue${n > 1 ? "s" : ""}, aucun lien cassé.`));
          }
          return crawl.brokenLinks.slice(0, 20).map((b) => {
            const path = pathOf(b.url);
            const from = b.from ? pathOf(b.from) : "";
            return fail(
              tr(
                ctx,
                `${path} returns ${b.status ?? "no response"}${from ? `, linked from ${from}` : ""}.`,
                `${path} répond ${b.status ?? "sans réponse"}${from ? `, lien depuis ${from}` : ""}.`,
              ),
              { observed: `${b.status ?? tr(ctx, "error", "erreur")} ${b.url}` },
            );
          });
        }),
    }),

    defineRule({
      id: "core.web.pages-metadata",
      title: "Every page has a unique title and a description",
      why: "Missing or duplicate titles make pages indistinguishable in search results and browser tabs.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: { label: "Google Search Central, title links", url: "https://developers.google.com/search/docs/appearance/title-link" },
      fix: "Give each page its own <title>, a meta description and a single <h1> heading.",
      fr: {
        title: "Chaque page a un titre unique et une description",
        why: "Des titres absents ou dupliqués rendent les pages indiscernables dans les résultats de recherche et les onglets.",
        fix: "Donnez à chaque page un <title> propre, une meta description et un seul titre <h1>.",
      },
      applies: (ctx) => ctx.spec.project.audience === "public",
      check: (ctx) =>
        withCrawl(ctx, (crawl) => {
          const ok = crawl.pages.filter((p) => p.status !== null && p.status < 400);
          const out: Finding[] = [];
          const noTitle = ok.filter((p) => !p.title);
          const titles = new Map<string, string[]>();
          for (const p of ok) if (p.title) titles.set(p.title, [...(titles.get(p.title) ?? []), pathOf(p.url)]);
          const dup = [...titles.entries()].filter(([, v]) => v.length > 1);
          const noDesc = ok.filter((p) => !p.metaDescription);
          const h1 = ok.filter((p) => p.h1 !== 1);
          if (noTitle.length) {
            const paths = list(noTitle.slice(0, 5).map((p) => pathOf(p.url)));
            out.push(fail(tr(ctx, `No title: ${paths}.`, `Sans titre : ${paths}.`)));
          }
          if (dup.length) {
            out.push(
              warn(
                tr(
                  ctx,
                  `Duplicate titles: ${list(dup.slice(0, 3).map(([t, v]) => `"${t}" (${v.length} pages)`))}.`,
                  `Titres dupliqués : ${list(dup.slice(0, 3).map(([t, v]) => `« ${t} » (${v.length} pages)`))}.`,
                ),
              ),
            );
          }
          if (noDesc.length) {
            out.push(warn(tr(ctx, `${plural(noDesc.length, "page")} out of ${ok.length} without a meta description.`, `${plural(noDesc.length, "page")} sans meta description sur ${ok.length}.`)));
          }
          if (h1.length) {
            const paths = list(h1.slice(0, 3).map((p) => pathOf(p.url)));
            out.push(
              warn(tr(ctx, `${plural(h1.length, "page")} without a single <h1> heading (${paths}).`, `${plural(h1.length, "page")} sans titre <h1> unique (${paths}).`), {
                severity: "info",
              }),
            );
          }
          return out.length
            ? out
            : pass(tr(ctx, `${plural(ok.length, "page")}: unique titles, descriptions and h1 present.`, `${plural(ok.length, "page")} : titres uniques, descriptions et h1 présents.`));
        }),
    }),

    defineRule({
      id: "core.web.vitals",
      title: "Fast and stable display (Core Web Vitals)",
      why: "Beyond 2.5 s to show the main content, or if the page jumps while loading, part of the visitors give up.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: { label: "web.dev, Core Web Vitals", url: "https://web.dev/articles/vitals" },
      fix: "Optimize the main image or block (size, format, preloading), reserve space for media and ads, defer third-party scripts.",
      fr: {
        title: "Affichage rapide et stable (Core Web Vitals)",
        why: "Au-delà de 2,5 s pour afficher le contenu principal, ou si la page saute pendant le chargement, une partie des visiteurs abandonne.",
        fix: "Optimisez l'image ou le bloc principal (taille, format, préchargement), réservez la place des médias et publicités, différez les scripts tiers.",
      },
      check: (ctx) =>
        withCrawl(ctx, (crawl) => {
          const measured = crawl.pages.filter((p) => p.timing.lcpMs !== undefined);
          if (!measured.length) return warn(tr(ctx, "Measurements not available in this browser.", "Mesures non disponibles dans ce navigateur."));
          const lcp = median(measured.map((p) => p.timing.lcpMs!));
          const cls = Math.max(...measured.map((p) => p.timing.cls ?? 0));
          const worst = measured.reduce((a, b) => (b.timing.lcpMs! > a.timing.lcpMs! ? b : a));
          const out: Finding[] = [];
          const pages = plural(measured.length, "page");
          const text = tr(
            ctx,
            `Median LCP ${sec(lcp, "en")} over ${pages}, slowest ${sec(worst.timing.lcpMs!, "en")} (${pathOf(worst.url)})`,
            `LCP médian ${sec(lcp, "fr")} sur ${pages}, le plus lent ${sec(worst.timing.lcpMs!, "fr")} (${pathOf(worst.url)})`,
          );
          if (lcp > 4000) out.push(fail(`${text}.`, { observed: `${Math.round(lcp)} ms` }));
          else if (lcp > 2500) out.push(warn(`${text}${tr(ctx, " (target: 2.5 s).", " (cible : 2,5 s).")}`, { observed: `${Math.round(lcp)} ms` }));
          else out.push(pass(`${text}.`, { observed: `${Math.round(lcp)} ms` }));
          if (cls > 0.25) out.push(fail(tr(ctx, `High layout shift (CLS ${cls}).`, `Décalage de mise en page élevé (CLS ${cls}).`), { observed: `CLS ${cls}` }));
          else if (cls > 0.1) {
            out.push(
              warn(tr(ctx, `Layout shift to watch (CLS ${cls}, target: 0.1).`, `Décalage de mise en page à surveiller (CLS ${cls}, cible : 0,1).`), {
                severity: "minor",
                observed: `CLS ${cls}`,
              }),
            );
          }
          return out;
        }),
    }),

    defineRule({
      id: "core.web.ttfb",
      title: "Reasonable server response time",
      why: "Beyond 800 ms before the first byte, the experience degrades sharply, especially on 3G.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: { label: "web.dev, Time to First Byte", url: "https://web.dev/articles/ttfb" },
      fix: "Enable caching (CDN, application cache), host closer to users, profile slow requests.",
      fr: {
        title: "Temps de réponse serveur raisonnable",
        why: "Au-delà de 800 ms avant le premier octet, l'expérience se dégrade nettement, surtout en 3G.",
        fix: "Activez le cache (CDN, cache applicatif), rapprochez l'hébergement des utilisateurs, profilez les requêtes lentes.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const t = web.timing.ttfbMs;
          if (t <= 800) return pass(tr(ctx, `First byte in ${t} ms.`, `Premier octet en ${t} ms.`), { observed: `${t} ms` });
          if (t <= 1800) return warn(tr(ctx, `First byte in ${t} ms (target: 800 ms).`, `Premier octet en ${t} ms (cible : 800 ms).`), { observed: `${t} ms` });
          return fail(tr(ctx, `First byte in ${t} ms.`, `Premier octet en ${t} ms.`), { observed: `${t} ms` });
        }),
    }),

    defineRule({
      id: "core.web.crawl-files",
      title: "robots.txt and sitemap published",
      why: "They guide search engines to the right pages and keep technical areas out of the index.",
      layer: 3,
      category: "quality",
      severity: "info",
      method: "auto",
      source: { label: "RFC 9309, Robots Exclusion Protocol", url: "https://www.rfc-editor.org/rfc/rfc9309" },
      fix: "Publish /robots.txt and a sitemap.xml referenced in robots.txt.",
      fr: {
        title: "robots.txt et sitemap publiés",
        why: "Ils guident les moteurs vers les bonnes pages et évitent l'indexation de zones techniques.",
        fix: "Publiez /robots.txt et un sitemap.xml référencé dans robots.txt.",
      },
      applies: (ctx) => ctx.spec.project.audience === "public",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (web.env !== "prod") return na(tr(ctx, "Checked in production only.", "Contrôlé uniquement en production."));
          return [
            web.wellKnown.robotsTxt ? pass(tr(ctx, "robots.txt present.", "robots.txt présent.")) : warn(tr(ctx, "robots.txt missing.", "robots.txt absent.")),
            web.wellKnown.sitemap ? pass(tr(ctx, "Sitemap present.", "Sitemap présent.")) : warn(tr(ctx, "Sitemap missing.", "Sitemap absent.")),
          ];
        }),
    }),
  ],
});

function techsOf(c: Component) {
  return [parseTech(c.tech), parseTech(c.runtime)].filter((t): t is { name: string; version?: string } => !!t);
}

function eolKnown(name: string) {
  return !!EOL[TECH_ALIASES[name] ?? name];
}

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** Seconds with one decimal: "2.5 s" in English, "2,5 s" in French. */
const sec = (ms: number, lang: Lang) => {
  const s = (ms / 1000).toFixed(1);
  return `${lang === "fr" ? s.replace(".", ",") : s} s`;
};
