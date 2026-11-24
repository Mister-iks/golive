import { EU_EEA, KINDS } from "@golive/spec";
import {
  dataStores,
  definePack,
  defineRule,
  evidence,
  fail,
  handlesPersonalData,
  handlesSensitiveData,
  hasFeature,
  pass,
  targetsCountry,
  warn,
  type Finding,
  type RuleContext,
} from "@golive/packs-sdk";
import { findLink, list, withWeb } from "./util";

const rgpd = (art: string) => ({
  label: `RGPD, article ${art}`,
  url: `https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679`,
});

const targetsEU = (ctx: RuleContext) => ctx.spec.project.countries.some((c) => EU_EEA.has(c));

const TRACKERS: [RegExp, string][] = [
  [/googletagmanager\.com|google-analytics\.com/i, "Google Analytics / Tag Manager"],
  [/connect\.facebook\.net/i, "Meta Pixel"],
  [/static\.hotjar\.com/i, "Hotjar"],
  [/clarity\.ms/i, "Microsoft Clarity"],
  [/analytics\.tiktok\.com/i, "TikTok Pixel"],
  [/snap\.licdn\.com/i, "LinkedIn Insight"],
  [/doubleclick\.net/i, "Google Ads"],
];

export const euGdpr = definePack({
  id: "eu-gdpr",
  name: "Union européenne et France",
  version: "0.1.0",
  description: "RGPD, cookies et traceurs, mentions légales (LCEN), transferts hors UE.",
  maintainer: "GoLive (pack communautaire, revue juridique à venir)",
  countries: [...EU_EEA],
  rules: [
    defineRule({
      id: "eu.gdpr.privacy-notice",
      title: "Politique de confidentialité publiée",
      why: "Le RGPD impose d'informer les personnes au moment de la collecte, de façon claire et accessible.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: rgpd("13"),
      fix: "Publiez une politique de confidentialité : responsable, finalités, bases légales, destinataires, durées, droits, contact du DPO.",
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx),
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence("Joignez le lien vers la politique de confidentialité.");
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/confidentialit/i, /donn[ée]es personnelles/i, /vie priv[ée]e/i, /privacy/i, /rgpd/i]);
          return link
            ? pass(`Lien détecté : « ${link.text || link.href} ».`, { observed: link.href })
            : evidence("Aucun lien vers une politique de confidentialité détecté sur la page d'accueil.");
        });
      },
    }),

    defineRule({
      id: "eu.gdpr.records",
      title: "Registre des traitements à jour",
      why: "Le registre est le premier document demandé lors d'un contrôle de l'autorité.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: rgpd("30"),
      fix: "Ajoutez ce traitement au registre : finalités, catégories de données, destinataires, durées, mesures de sécurité.",
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx),
      check: () => evidence("Attestez l'inscription du traitement au registre."),
    }),

    defineRule({
      id: "eu.gdpr.processors",
      title: "Contrats avec les sous-traitants",
      why: "Chaque prestataire qui manipule des données personnelles pour vous doit être lié par un contrat conforme à l'article 28.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: rgpd("28"),
      fix: "Signez (ou acceptez) l'accord de traitement des données (DPA) de chaque prestataire concerné.",
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx),
      check: (ctx) => {
        const providers = new Set<string>();
        for (const c of ctx.spec.components) {
          if (KINDS[c.kind].exposure === "managed" && c.kind !== "mobile") providers.add(c.tech ?? c.id);
          const p = ctx.graph.provider(c);
          if (p) providers.add(p);
        }
        return providers.size
          ? evidence(`Prestataires concernés : ${list([...providers].sort())}. Joignez les DPA.`)
          : evidence("Listez vos hébergeurs et prestataires, et joignez leurs DPA.");
      },
    }),

    defineRule({
      id: "eu.gdpr.transfers",
      title: "Transferts hors UE encadrés",
      why: "Des données stockées hors de l'Espace économique européen exigent une décision d'adéquation ou des garanties appropriées.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: rgpd("44 à 49"),
      fix: "Hébergez dans l'EEE, ou documentez la décision d'adéquation ou les clauses contractuelles types.",
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx) && dataStores(ctx).length > 0,
      check: (ctx) => {
        const out: Finding[] = [];
        for (const s of dataStores(ctx)) {
          const country = ctx.graph.country(s);
          if (!country) out.push(warn(`Pays d'hébergement de ${ctx.graph.label(s.id)} non déclaré.`, { target: s.id }));
          else if (!EU_EEA.has(country)) out.push(evidence(`${ctx.graph.label(s.id)} est hébergé hors EEE (${country}).`, { target: s.id, observed: country }));
          else out.push(pass(`${ctx.graph.label(s.id)} est hébergé dans l'EEE (${country}).`, { target: s.id }));
        }
        return out;
      },
    }),

    defineRule({
      id: "eu.gdpr.dpia",
      title: "Analyse d'impact (AIPD)",
      why: "Les traitements de données sensibles ou à grande échelle exigent une analyse d'impact avant leur mise en œuvre.",
      layer: 1,
      category: "legal",
      severity: "blocker",
      method: "evidence",
      legal: true,
      source: rgpd("35"),
      fix: "Réalisez l'AIPD (l'outil PIA de la CNIL est gratuit) et consultez l'autorité si le risque résiduel reste élevé.",
      applies: (ctx) => targetsEU(ctx) && handlesSensitiveData(ctx),
      check: (ctx) => evidence(`Données sensibles déclarées : ${list(ctx.spec.data.sensitive)}. Joignez l'AIPD.`),
    }),

    defineRule({
      id: "eu.gdpr.erasure",
      title: "Suppression de compte possible",
      why: "Toute personne peut demander l'effacement de ses données ; un compte doit pouvoir être supprimé simplement.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: rgpd("17"),
      fix: "Proposez la suppression du compte depuis l'espace utilisateur et purgez aussi sauvegardes et prestataires dans un délai défini.",
      applies: (ctx) => targetsEU(ctx) && hasFeature(ctx, "accounts"),
      check: () => evidence("Attestez la procédure de suppression de compte."),
    }),

    defineRule({
      id: "eu.cookies.consent",
      title: "Aucun traceur avant consentement",
      why: "Déposer des traceurs publicitaires ou de mesure non exemptés avant le choix de l'utilisateur est sanctionné par les autorités.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "auto",
      legal: true,
      source: { label: "Directive ePrivacy, art. 5(3) ; lignes directrices CNIL", url: "https://www.cnil.fr/fr/cookies-et-autres-traceurs" },
      fix: "Chargez ces scripts uniquement après consentement (gestionnaire de consentement), ou passez à une mesure d'audience exemptée.",
      applies: targetsEU,
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const found = new Set<string>();
          for (const src of web.html?.scripts ?? []) for (const [re, name] of TRACKERS) if (re.test(src)) found.add(name);
          for (const c of web.setCookies) if (/^(_ga|_gid|_fbp|_hj|_clck|_uet)/.test(c.name)) found.add(`cookie ${c.name}`);
          return found.size
            ? fail(`Chargés dès l'arrivée sur la page : ${list([...found])}.`, { observed: [...found].join(", ") })
            : pass("Aucun traceur connu chargé avant consentement.");
        }),
    }),

    defineRule({
      id: "fr.lcen.legal-notice",
      title: "Mentions légales (France)",
      why: "La LCEN impose d'identifier l'éditeur, le directeur de la publication et l'hébergeur de tout site.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: { label: "Loi n° 2004-575 (LCEN), article 1-1 (ex-article 6 III)", url: "https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164" },
      fix: "Publiez une page « Mentions légales » liée depuis toutes les pages.",
      applies: (ctx) => targetsCountry(ctx, "FR") && ctx.spec.project.audience !== "internal",
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence("Joignez le lien vers les mentions légales.");
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/mentions l[ée]gales/i, /legal notice/i, /imprint/i]);
          return link
            ? pass(`Lien détecté : « ${link.text || link.href} ».`, { observed: link.href })
            : fail("Aucun lien « Mentions légales » sur la page d'accueil.");
        });
      },
    }),
  ],
});
