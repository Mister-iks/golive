import { ENCRYPTED_PROTOCOLS, EOL, EOL_SNAPSHOT, TECH_ALIASES, eolDate, parseTech, type Component } from "@golive/spec";
import {
  dataStores,
  definePack,
  defineRule,
  fail,
  isCritical,
  na,
  pass,
  warn,
  type Finding,
} from "@golive/packs-sdk";
import { daysBetween, list, withWeb } from "./util";

const ENDOFLIFE = { label: "endoflife.date", url: "https://endoflife.date" };

export const core = definePack({
  id: "golive-core",
  name: "Socle GoLive",
  version: "0.1.0",
  description: "Architecture, technologies et qualité de base de tout projet mis en ligne.",
  maintainer: "GoLive",
  core: true,
  rules: [
    defineRule({
      id: "core.arch.datastore-private",
      title: "Aucun stockage de données exposé sur Internet",
      why: "Une base, un cache ou une file joignable depuis Internet est la première cause de fuite massive de données.",
      layer: 1,
      category: "architecture",
      severity: "blocker",
      method: "auto",
      source: { label: "OWASP Top 10 A05: Security Misconfiguration", url: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/" },
      fix: "Placez le stockage dans un réseau privé et ne l'exposez qu'aux services applicatifs. Passez par une API pour tout accès externe.",
      applies: (ctx) => dataStores(ctx).length > 0,
      check: (ctx) =>
        dataStores(ctx).map((c) =>
          ctx.graph.exposure(c) === "public"
            ? fail(`${ctx.graph.label(c.id)} est joignable depuis Internet.`, { target: c.id, observed: "exposure: public" })
            : pass(`${ctx.graph.label(c.id)} est dans un réseau privé.`, { target: c.id }),
        ),
    }),

    defineRule({
      id: "core.arch.encrypted-links",
      title: "Tous les échanges sont chiffrés",
      why: "Un flux en clair peut être lu ou modifié par quiconque se trouve sur le chemin réseau, y compris chez l'hébergeur.",
      layer: 1,
      category: "architecture",
      severity: "major",
      method: "auto",
      source: { label: "OWASP ASVS: Secure Communication", url: "https://owasp.org/www-project-application-security-verification-standard/" },
      fix: "Utilisez la variante chiffrée du protocole (https, postgres-tls, rediss, amqps, smtps…) et vérifiez les certificats côté client.",
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
          out.push(fail(`${name} utilise ${l.protocol} en clair.`, { target: id, observed: l.protocol, severity }));
        }
        return out.length ? out : pass("Tous les liens déclarés utilisent un protocole chiffré.");
      },
    }),

    defineRule({
      id: "core.arch.backup",
      title: "Les données sont sauvegardées",
      why: "Sans sauvegarde externalisée, une erreur, un rançongiciel ou une panne disque efface définitivement le service.",
      layer: 1,
      category: "operations",
      severity: "blocker",
      method: "auto",
      source: { label: "ANSSI, guide d'hygiène informatique, mesure 37", url: "https://cyber.gouv.fr/publications/guide-dhygiene-informatique" },
      fix: "Ajoutez un composant « Sauvegarde » relié à chaque base et stockage, hébergé ailleurs que la donnée d'origine.",
      applies: (ctx) => ctx.graph.has("database", "storage"),
      check: (ctx) => {
        const stores = ctx.graph.ofKind("database", "storage");
        const backups = ctx.graph.ofKind("backup");
        if (backups.length === 0) return fail("Aucun composant de sauvegarde dans l'architecture.");
        return stores.map((s) =>
          backups.some((b) => ctx.graph.linked(b.id, s.id))
            ? pass(`${ctx.graph.label(s.id)} est sauvegardé.`, { target: s.id })
            : fail(`${ctx.graph.label(s.id)} n'est relié à aucune sauvegarde.`, { target: s.id, severity: "major" }),
        );
      },
    }),

    defineRule({
      id: "core.arch.monitoring",
      title: "Le service est supervisé",
      why: "Sans supervision, ce sont vos utilisateurs qui découvrent les pannes, souvent des heures après.",
      layer: 1,
      category: "operations",
      severity: "major",
      method: "auto",
      source: { label: "Google SRE Book, Monitoring Distributed Systems", url: "https://sre.google/sre-book/monitoring-distributed-systems/" },
      fix: "Ajoutez une supervision (disponibilité, erreurs, latence) avec des alertes envoyées à une personne.",
      check: (ctx) =>
        ctx.graph.has("monitoring")
          ? pass("Un composant de supervision est déclaré.")
          : fail("Aucune supervision déclarée."),
    }),

    defineRule({
      id: "core.arch.logging",
      title: "Les journaux sont centralisés",
      why: "En cas d'incident, des journaux centralisés et conservés sont la seule façon de comprendre ce qui s'est passé.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "auto",
      source: { label: "OWASP Logging Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html" },
      fix: "Envoyez les journaux applicatifs vers un service central avec une durée de conservation définie.",
      applies: (ctx) => ctx.graph.has("backend", "api", "frontend"),
      check: (ctx) =>
        ctx.graph.has("logging", "monitoring")
          ? pass("Les journaux ont une destination centrale.")
          : warn("Aucun composant de journalisation ni de supervision."),
    }),

    defineRule({
      id: "core.arch.secrets",
      title: "Les secrets sont dans un coffre",
      why: "Des clés en clair dans le code ou les variables d'un serveur finissent tôt ou tard dans un dépôt public ou une sauvegarde.",
      layer: 1,
      category: "security",
      severity: (ctx) => (isCritical(ctx) ? "major" : "minor"),
      method: "auto",
      source: { label: "OWASP Secrets Management Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html" },
      fix: "Stockez mots de passe, clés d'API et certificats dans un coffre (Vault, OpenBao, Infisical, SOPS…) et injectez-les au démarrage.",
      applies: (ctx) => ctx.graph.has("backend", "api"),
      check: (ctx) =>
        ctx.graph.has("secrets") ? pass("Un coffre à secrets est déclaré.") : fail("Aucun coffre à secrets déclaré."),
    }),

    defineRule({
      id: "core.arch.edge",
      title: "Le trafic public passe par un point d'entrée maîtrisé",
      why: "Un CDN, un pare-feu applicatif ou un reverse proxy absorbe les pics, filtre les attaques courantes et centralise TLS.",
      layer: 1,
      category: "architecture",
      severity: "minor",
      method: "auto",
      source: { label: "OWASP Top 10 A05", url: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/" },
      fix: "Placez un CDN, un WAF ou un répartiteur de charge entre Internet et vos serveurs d'application.",
      applies: (ctx) => ctx.spec.project.audience !== "internal" && ctx.graph.has("frontend", "api", "backend"),
      check: (ctx) => {
        if (ctx.graph.has("cdn", "waf", "load-balancer")) return pass("Un point d'entrée (CDN, WAF ou proxy) est déclaré.");
        const direct = ctx.graph.ofKind("backend", "api").filter((c) => ctx.graph.exposure(c) === "public");
        return warn(
          direct.length
            ? `Serveurs applicatifs exposés directement : ${list(direct.map((c) => ctx.graph.label(c.id)))}.`
            : "Aucun CDN, WAF ni reverse proxy devant l'application.",
        );
      },
    }),

    defineRule({
      id: "core.arch.orphans",
      title: "Chaque composant est relié",
      why: "Un composant isolé signale souvent un oubli dans le schéma, donc un flux non analysé.",
      layer: 1,
      category: "architecture",
      severity: "info",
      method: "auto",
      source: { label: "GoLive Spec" },
      fix: "Reliez le composant aux éléments avec lesquels il échange, ou retirez-le du schéma.",
      applies: (ctx) => ctx.spec.components.length > 1,
      check: (ctx) => {
        const orphans = ctx.spec.components.filter((c) => ctx.graph.linksFrom(c.id).length + ctx.graph.linksTo(c.id).length === 0);
        return orphans.length
          ? orphans.map((c) => warn(`${ctx.graph.label(c.id)} n'est relié à rien.`, { target: c.id }))
          : pass("Tous les composants sont reliés.");
      },
    }),

    defineRule({
      id: "core.tech.eol",
      title: "Aucune technologie en fin de vie",
      why: "Une version qui ne reçoit plus de correctifs de sécurité accumule des failles connues et publiées.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: `endoflife.date (instantané du ${EOL_SNAPSHOT})`, url: ENDOFLIFE.url },
      fix: "Planifiez la montée vers une version encore maintenue avant la mise en ligne.",
      applies: (ctx) => ctx.spec.components.some((c) => techsOf(c).some((t) => !!t.version)),
      check: (ctx) => {
        const out: Finding[] = [];
        for (const c of ctx.spec.components) {
          for (const t of techsOf(c)) {
            const eol = eolDate(t.name, t.version);
            if (!eol) continue;
            const days = daysBetween(eol.date, ctx.asOf);
            const label = `${t.name} ${eol.cycle}`;
            if (days >= 0) {
              out.push(
                fail(`${label} (${ctx.graph.label(c.id)}) n'est plus maintenu depuis le ${eol.date}.`, {
                  target: c.id,
                  observed: `${t.name}@${t.version}`,
                  severity: days > 365 ? "blocker" : "major",
                }),
              );
            } else if (days > -180) {
              out.push(
                warn(`${label} (${ctx.graph.label(c.id)}) arrive en fin de vie le ${eol.date}.`, {
                  target: c.id,
                  observed: `${t.name}@${t.version}`,
                  severity: "minor",
                }),
              );
            } else {
              out.push(pass(`${label} est maintenu jusqu'au ${eol.date}.`, { target: c.id }));
            }
          }
        }
        return out.length ? out : na("Aucune version déclarée n'est référencée dans la base de fin de vie.");
      },
    }),

    defineRule({
      id: "core.tech.versions",
      title: "Les versions sont déclarées",
      why: "Sans version, impossible de savoir si une technologie est vulnérable ou en fin de vie.",
      layer: 1,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: ENDOFLIFE,
      fix: "Indiquez la version majeure de chaque technologie, par exemple postgresql@17 ou nodejs@22.",
      applies: (ctx) => ctx.spec.components.some((c) => !!c.tech),
      check: (ctx) => {
        const missing = ctx.spec.components.filter((c) => {
          const t = parseTech(c.tech);
          return t && !t.version && eolKnown(t.name);
        });
        return missing.length
          ? missing.map((c) => warn(`${ctx.graph.label(c.id)} : version de ${c.tech} non précisée.`, { target: c.id }))
          : pass("Les technologies suivies ont une version.");
      },
    }),

    /* ---------------------------------------------------------- layer 3 */

    defineRule({
      id: "core.web.reachable",
      title: "Le site répond correctement",
      why: "Le point de départ de toute vérification : la cible déclarée doit répondre sans erreur.",
      layer: 3,
      category: "quality",
      severity: "blocker",
      method: "auto",
      source: { label: "RFC 9110, HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110" },
      fix: "Vérifiez le DNS, le certificat et la configuration du serveur, puis relancez l'audit.",
      applies: (ctx) => !!ctx.web,
      check: (ctx) => {
        const web = ctx.web!;
        if (!web.ok) return fail(web.error ?? "Le site ne répond pas.", { observed: web.url });
        if ((web.status ?? 0) >= 400) return fail(`Le site répond avec le code ${web.status}.`, { observed: String(web.status) });
        return pass(`Réponse ${web.status} en ${web.timing.totalMs} ms.`, { observed: web.finalUrl });
      },
    }),

    defineRule({
      id: "core.web.indexing",
      title: "L'indexation correspond à l'environnement",
      why: "Une production en noindex est invisible sur les moteurs ; une pré-production indexable expose un site de test au public.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: { label: "Google Search Central, noindex", url: "https://developers.google.com/search/docs/crawling-indexing/block-indexing" },
      fix: "En production, retirez le noindex (balise meta et en-tête X-Robots-Tag). En pré-production, ajoutez-le et protégez l'accès.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const robots = `${web.html?.robots ?? ""} ${web.headers["x-robots-tag"] ?? ""}`.toLowerCase();
          const noindex = robots.includes("noindex");
          if (web.env === "prod") {
            return noindex
              ? fail("La production demande aux moteurs de ne pas l'indexer.", { observed: robots.trim() })
              : pass("La production est indexable.");
          }
          return noindex
            ? pass("La pré-production est exclue des moteurs.")
            : fail("La pré-production est indexable par les moteurs de recherche.", { severity: "minor" });
        }),
    }),

    defineRule({
      id: "core.web.metadata",
      title: "Titre et description de page présents",
      why: "Ils conditionnent l'affichage dans les résultats de recherche et les aperçus de partage.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: { label: "Google Search Central, title links", url: "https://developers.google.com/search/docs/appearance/title-link" },
      fix: "Renseignez une balise <title> unique et une meta description de 50 à 160 caractères.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const out: Finding[] = [];
          const title = web.html?.title?.trim();
          const desc = web.html?.metaDescription?.trim();
          out.push(title ? pass(`Titre : « ${title} »`) : fail("Balise <title> absente ou vide."));
          out.push(desc ? pass("Meta description présente.") : warn("Meta description absente."));
          return out;
        }),
    }),

    defineRule({
      id: "core.web.ttfb",
      title: "Temps de réponse serveur raisonnable",
      why: "Au-delà de 800 ms avant le premier octet, l'expérience se dégrade nettement, surtout en 3G.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: { label: "web.dev, Time to First Byte", url: "https://web.dev/articles/ttfb" },
      fix: "Activez le cache (CDN, cache applicatif), rapprochez l'hébergement des utilisateurs, profilez les requêtes lentes.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const t = web.timing.ttfbMs;
          if (t <= 800) return pass(`Premier octet en ${t} ms.`, { observed: `${t} ms` });
          if (t <= 1800) return warn(`Premier octet en ${t} ms (cible : 800 ms).`, { observed: `${t} ms` });
          return fail(`Premier octet en ${t} ms.`, { observed: `${t} ms` });
        }),
    }),

    defineRule({
      id: "core.web.crawl-files",
      title: "robots.txt et sitemap publiés",
      why: "Ils guident les moteurs vers les bonnes pages et évitent l'indexation de zones techniques.",
      layer: 3,
      category: "quality",
      severity: "info",
      method: "auto",
      source: { label: "RFC 9309, Robots Exclusion Protocol", url: "https://www.rfc-editor.org/rfc/rfc9309" },
      fix: "Publiez /robots.txt et un sitemap.xml référencé dans robots.txt.",
      applies: (ctx) => ctx.spec.project.audience === "public",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (web.env !== "prod") return na("Contrôlé uniquement en production.");
          return [
            web.wellKnown.robotsTxt ? pass("robots.txt présent.") : warn("robots.txt absent."),
            web.wellKnown.sitemap ? pass("Sitemap présent.") : warn("Sitemap absent."),
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
