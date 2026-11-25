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
  tr,
  warn,
  type Finding,
  type RuleContext,
} from "@golive/packs-sdk";
import { findLink, list, TRACKER_COOKIE, TRACKERS, withWeb } from "./util";

const GDPR_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679";
const gdpr = (art: string) => ({ label: `GDPR, Article ${art}`, url: GDPR_URL });
const rgpd = (art: string) => `RGPD, article ${art}`;

const targetsEU = (ctx: RuleContext) => ctx.spec.project.countries.some((c) => EU_EEA.has(c));

const PRIVACY_LINK = [/confidentialit/i, /donn[ée]es personnelles/i, /vie priv[ée]e/i, /privacy/i, /rgpd/i, /gdpr/i, /personal data/i, /data protection/i];

export const euGdpr = definePack({
  id: "eu-gdpr",
  name: "European Union and France",
  version: "0.1.0",
  description: "GDPR, cookies and trackers, legal notice (LCEN), transfers outside the EU.",
  maintainer: "PcyBox GoLive (community pack, legal review pending)",
  fr: { name: "Union européenne et France", description: "RGPD, cookies et traceurs, mentions légales (LCEN), transferts hors UE." },
  countries: [...EU_EEA],
  rules: [
    defineRule({
      id: "eu.gdpr.privacy-notice",
      title: "Privacy policy published",
      why: "The GDPR requires informing people clearly and accessibly at the time their data is collected.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: gdpr("13"),
      fix: "Publish a privacy policy: controller, purposes, legal bases, recipients, retention periods, rights, DPO contact.",
      fr: {
        title: "Politique de confidentialité publiée",
        why: "Le RGPD impose d'informer les personnes au moment de la collecte, de façon claire et accessible.",
        fix: "Publiez une politique de confidentialité : responsable, finalités, bases légales, destinataires, durées, droits, contact du DPO.",
        source: rgpd("13"),
      },
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx),
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence(tr(ctx, "Attach the link to the privacy policy.", "Joignez le lien vers la politique de confidentialité."));
        return withWeb(ctx, (web) => {
          const link = findLink(web, PRIVACY_LINK);
          return link
            ? pass(tr(ctx, `Link found: "${link.text || link.href}".`, `Lien détecté : « ${link.text || link.href} ».`), { observed: link.href })
            : evidence(tr(ctx, "No link to a privacy policy found on the home page.", "Aucun lien vers une politique de confidentialité détecté sur la page d'accueil."));
        });
      },
    }),

    defineRule({
      id: "eu.gdpr.records",
      title: "Record of processing activities up to date",
      why: "The record is the first document requested during an inspection by the authority.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: gdpr("30"),
      fix: "Add this processing to the record: purposes, data categories, recipients, retention periods, security measures.",
      fr: {
        title: "Registre des traitements à jour",
        why: "Le registre est le premier document demandé lors d'un contrôle de l'autorité.",
        fix: "Ajoutez ce traitement au registre : finalités, catégories de données, destinataires, durées, mesures de sécurité.",
        source: rgpd("30"),
      },
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx),
      check: (ctx) => evidence(tr(ctx, "Attest that the processing is entered in the record.", "Attestez l'inscription du traitement au registre.")),
    }),

    defineRule({
      id: "eu.gdpr.processors",
      title: "Contracts with processors",
      why: "Every provider that handles personal data on your behalf must be bound by a contract that complies with Article 28.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: gdpr("28"),
      fix: "Sign (or accept) the data processing agreement (DPA) of each provider concerned.",
      fr: {
        title: "Contrats avec les sous-traitants",
        why: "Chaque prestataire qui manipule des données personnelles pour vous doit être lié par un contrat conforme à l'article 28.",
        fix: "Signez (ou acceptez) l'accord de traitement des données (DPA) de chaque prestataire concerné.",
        source: rgpd("28"),
      },
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx),
      check: (ctx) => {
        const providers = new Set<string>();
        for (const c of ctx.spec.components) {
          if (KINDS[c.kind].exposure === "managed" && c.kind !== "mobile") providers.add(c.tech ?? c.id);
          const p = ctx.graph.provider(c);
          if (p) providers.add(p);
        }
        const names = list([...providers].sort());
        return providers.size
          ? evidence(tr(ctx, `Providers concerned: ${names}. Attach the DPAs.`, `Prestataires concernés : ${names}. Joignez les DPA.`))
          : evidence(tr(ctx, "List your hosting and service providers, and attach their DPAs.", "Listez vos hébergeurs et prestataires, et joignez leurs DPA."));
      },
    }),

    defineRule({
      id: "eu.gdpr.transfers",
      title: "Transfers outside the EU covered",
      why: "Data stored outside the European Economic Area requires an adequacy decision or appropriate safeguards.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: gdpr("44 to 49"),
      fix: "Host in the EEA, or document the adequacy decision or the standard contractual clauses.",
      fr: {
        title: "Transferts hors UE encadrés",
        why: "Des données stockées hors de l'Espace économique européen exigent une décision d'adéquation ou des garanties appropriées.",
        fix: "Hébergez dans l'EEE, ou documentez la décision d'adéquation ou les clauses contractuelles types.",
        source: rgpd("44 à 49"),
      },
      applies: (ctx) => targetsEU(ctx) && handlesPersonalData(ctx) && dataStores(ctx).length > 0,
      check: (ctx) => {
        const out: Finding[] = [];
        for (const s of dataStores(ctx)) {
          const country = ctx.graph.country(s);
          const name = ctx.graph.label(s.id);
          if (!country) out.push(warn(tr(ctx, `Hosting country of ${name} not declared.`, `Pays d'hébergement de ${name} non déclaré.`), { target: s.id }));
          else if (!EU_EEA.has(country))
            out.push(evidence(tr(ctx, `${name} is hosted outside the EEA (${country}).`, `${name} est hébergé hors EEE (${country}).`), { target: s.id, observed: country }));
          else out.push(pass(tr(ctx, `${name} is hosted in the EEA (${country}).`, `${name} est hébergé dans l'EEE (${country}).`), { target: s.id }));
        }
        return out;
      },
    }),

    defineRule({
      id: "eu.gdpr.dpia",
      title: "Data protection impact assessment (DPIA)",
      why: "Processing sensitive data or processing on a large scale requires an impact assessment before it starts.",
      layer: 1,
      category: "legal",
      severity: "blocker",
      method: "evidence",
      legal: true,
      source: gdpr("35"),
      fix: "Carry out the DPIA (the CNIL PIA tool is free) and consult the authority if the residual risk remains high.",
      fr: {
        title: "Analyse d'impact (AIPD)",
        why: "Les traitements de données sensibles ou à grande échelle exigent une analyse d'impact avant leur mise en œuvre.",
        fix: "Réalisez l'AIPD (l'outil PIA de la CNIL est gratuit) et consultez l'autorité si le risque résiduel reste élevé.",
        source: rgpd("35"),
      },
      applies: (ctx) => targetsEU(ctx) && handlesSensitiveData(ctx),
      check: (ctx) => {
        const data = list(ctx.spec.data.sensitive);
        return evidence(tr(ctx, `Sensitive data declared: ${data}. Attach the DPIA.`, `Données sensibles déclarées : ${data}. Joignez l'AIPD.`));
      },
    }),

    defineRule({
      id: "eu.gdpr.erasure",
      title: "Account deletion available",
      why: "Anyone can request the erasure of their data; an account must be easy to delete.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: gdpr("17"),
      fix: "Offer account deletion from the user area, and also purge backups and providers within a defined period.",
      fr: {
        title: "Suppression de compte possible",
        why: "Toute personne peut demander l'effacement de ses données ; un compte doit pouvoir être supprimé simplement.",
        fix: "Proposez la suppression du compte depuis l'espace utilisateur et purgez aussi sauvegardes et prestataires dans un délai défini.",
        source: rgpd("17"),
      },
      applies: (ctx) => targetsEU(ctx) && hasFeature(ctx, "accounts"),
      check: (ctx) => evidence(tr(ctx, "Attest the account deletion procedure.", "Attestez la procédure de suppression de compte.")),
    }),

    defineRule({
      id: "eu.cookies.consent",
      title: "No trackers before consent",
      why: "Authorities sanction setting advertising or non-exempt audience measurement trackers before the user has chosen.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "auto",
      legal: true,
      source: { label: "ePrivacy Directive, Art. 5(3); CNIL guidelines", url: "https://www.cnil.fr/fr/cookies-et-autres-traceurs" },
      fix: "Load these scripts only after consent (consent management platform), or switch to an exempt audience measurement tool.",
      fr: {
        title: "Aucun traceur avant consentement",
        why: "Déposer des traceurs publicitaires ou de mesure non exemptés avant le choix de l'utilisateur est sanctionné par les autorités.",
        fix: "Chargez ces scripts uniquement après consentement (gestionnaire de consentement), ou passez à une mesure d'audience exemptée.",
        source: "Directive ePrivacy, art. 5(3) ; lignes directrices CNIL",
      },
      applies: targetsEU,
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const found = new Set<string>();
          for (const src of web.html?.scripts ?? []) for (const [re, name] of TRACKERS) if (re.test(src)) found.add(name);
          for (const c of web.setCookies) if (TRACKER_COOKIE.test(c.name)) found.add(`cookie ${c.name}`);
          // A full audit also sees what the browser loaded and stored before any click.
          for (const host of web.crawl?.thirdParties ?? []) for (const [re, name] of TRACKERS) if (re.test(host)) found.add(name);
          for (const c of web.crawl?.cookiesBeforeConsent ?? []) if (TRACKER_COOKIE.test(c.name)) found.add(`cookie ${c.name}`);
          const names = list([...found]);
          return found.size
            ? fail(tr(ctx, `Loaded as soon as the page opens: ${names}.`, `Chargés dès l'arrivée sur la page : ${names}.`), { observed: [...found].join(", ") })
            : pass(tr(ctx, "No known tracker loaded before consent.", "Aucun traceur connu chargé avant consentement."));
        }),
    }),

    defineRule({
      id: "fr.lcen.legal-notice",
      title: "Legal notice (France)",
      why: "The LCEN (French law on confidence in the digital economy) requires every site to identify its publisher, publication director and host.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: { label: "Law No. 2004-575 (LCEN), Article 1-1 (formerly Article 6 III)", url: "https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164" },
      fix: "Publish a \"Mentions légales\" (legal notice) page linked from every page.",
      fr: {
        title: "Mentions légales (France)",
        why: "La LCEN impose d'identifier l'éditeur, le directeur de la publication et l'hébergeur de tout site.",
        fix: "Publiez une page « Mentions légales » liée depuis toutes les pages.",
        source: "Loi n° 2004-575 (LCEN), article 1-1 (ex-article 6 III)",
      },
      applies: (ctx) => targetsCountry(ctx, "FR") && ctx.spec.project.audience !== "internal",
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence(tr(ctx, "Attach the link to the legal notice.", "Joignez le lien vers les mentions légales."));
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/mentions l[ée]gales/i, /legal notice/i, /imprint/i]);
          return link
            ? pass(tr(ctx, `Link found: "${link.text || link.href}".`, `Lien détecté : « ${link.text || link.href} ».`), { observed: link.href })
            : fail(tr(ctx, "No \"Mentions légales\" (legal notice) link on the home page.", "Aucun lien « Mentions légales » sur la page d'accueil."));
        });
      },
    }),
  ],
});
