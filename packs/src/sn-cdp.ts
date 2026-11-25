import {
  dataStores,
  definePack,
  defineRule,
  evidence,
  fail,
  handlesPersonalData,
  handlesSensitiveData,
  pass,
  targetsCountry,
  tr,
  warn,
  type Finding,
} from "@golive/packs-sdk";
import { findLink, list, withWeb } from "./util";

const LOI_2008_12 = { label: "Law No. 2008-12 of 25 January 2008 on personal data protection (Senegal)", url: "https://www.cdp.sn" };
const LOI_2008_12_FR = "Loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel";
const LOI_2008_08 = { label: "Law No. 2008-08 of 25 January 2008 on electronic transactions (Senegal)" };
const LOI_2008_08_FR = "Loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques";

export const snCdp = definePack({
  id: "sn-cdp",
  name: "Senegal",
  version: "0.1.0",
  description: "Law 2008-12 and formalities with the CDP, notices for commercial sites, hosting of public data.",
  maintainer: "PcyBox GoLive (community pack, legal review pending)",
  fr: { name: "Sénégal", description: "Loi 2008-12 et formalités auprès de la CDP, mentions des sites marchands, hébergement des données publiques." },
  countries: ["SN"],
  rules: [
    defineRule({
      id: "sn.cdp.declaration",
      title: "Processing declared to the CDP",
      why: "In Senegal, processing personal data requires a prior formality with the CDP (Commission de protection des données personnelles, the data protection authority).",
      layer: 1,
      category: "legal",
      severity: "blocker",
      method: "evidence",
      legal: true,
      source: LOI_2008_12,
      fix: "File the declaration (or the request for an opinion or authorization, depending on the case) with the CDP before the service opens.",
      fr: {
        title: "Traitement déclaré à la CDP",
        why: "Au Sénégal, un traitement de données personnelles doit faire l'objet d'une formalité préalable auprès de la Commission de protection des données personnelles.",
        fix: "Effectuez la déclaration (ou la demande d'avis / d'autorisation selon le cas) auprès de la CDP avant l'ouverture du service.",
        source: LOI_2008_12_FR,
      },
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesPersonalData(ctx),
      check: (ctx) => evidence(tr(ctx, "Attach the CDP declaration receipt or decision.", "Joignez le récépissé de déclaration ou la décision de la CDP.")),
    }),

    defineRule({
      id: "sn.cdp.authorisation",
      title: "Authorization for sensitive data",
      why: "Health, biometric, national identification or judicial data fall under a prior authorization regime, stricter than a simple declaration.",
      layer: 1,
      category: "legal",
      severity: "blocker",
      method: "evidence",
      legal: true,
      source: LOI_2008_12,
      fix: "Submit an authorization request to the CDP describing purposes, security measures and retention periods.",
      fr: {
        title: "Autorisation pour les données sensibles",
        why: "Les données de santé, biométriques, d'identification nationale ou judiciaires relèvent d'un régime d'autorisation préalable, plus strict que la simple déclaration.",
        fix: "Déposez une demande d'autorisation auprès de la CDP en décrivant finalités, mesures de sécurité et durées de conservation.",
        source: LOI_2008_12_FR,
      },
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesSensitiveData(ctx),
      check: (ctx) => {
        const data = list(ctx.spec.data.sensitive);
        return evidence(tr(ctx, `Data concerned: ${data}. Attach the CDP authorization.`, `Données concernées : ${data}. Joignez l'autorisation de la CDP.`));
      },
    }),

    defineRule({
      id: "sn.cdp.transfer",
      title: "Transfers of data outside Senegal covered",
      why: "Hosting data about people in Senegal in another country is a transfer, subject to conditions and often to authorization.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: LOI_2008_12,
      fix: "Host the data in Senegal, or obtain the CDP's transfer authorization and document the safeguards.",
      fr: {
        title: "Transfert de données hors du Sénégal encadré",
        why: "Héberger des données de personnes au Sénégal dans un autre pays constitue un transfert, soumis à conditions et souvent à autorisation.",
        fix: "Hébergez les données au Sénégal, ou obtenez l'autorisation de transfert de la CDP et documentez les garanties.",
        source: LOI_2008_12_FR,
      },
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesPersonalData(ctx) && dataStores(ctx).length > 0,
      check: (ctx) => {
        const out: Finding[] = [];
        for (const s of dataStores(ctx)) {
          const country = ctx.graph.country(s);
          const name = ctx.graph.label(s.id);
          if (!country) out.push(warn(tr(ctx, `Hosting country of ${name} not declared.`, `Pays d'hébergement de ${name} non déclaré.`), { target: s.id }));
          else if (country !== "SN")
            out.push(evidence(tr(ctx, `${name} is hosted outside Senegal (${country}).`, `${name} est hébergé hors du Sénégal (${country}).`), { target: s.id, observed: country }));
          else out.push(pass(tr(ctx, `${name} is hosted in Senegal.`, `${name} est hébergé au Sénégal.`), { target: s.id }));
        }
        return out;
      },
    }),

    defineRule({
      id: "sn.public.hosting",
      title: "Public service data hosted in Senegal",
      why: "Digital sovereignty is a major pillar of the national strategy: data of a public service is meant to stay in the country.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "auto",
      legal: true,
      source: { label: "New Deal Technologique (Senegal's digital strategy, 2025)", url: "https://primature.sn/publications/actualites/strategie-numerique-du-senegal-le-new-deal-technologique-horizon-2034" },
      fix: "Host databases and storage in the national datacenter or with a hosting provider established in Senegal.",
      fr: {
        title: "Données d'un service public hébergées au Sénégal",
        why: "La souveraineté numérique est un axe majeur de la stratégie nationale : les données d'un service public ont vocation à rester sur le territoire.",
        fix: "Hébergez bases et stockages au datacenter national ou chez un hébergeur établi au Sénégal.",
        source: "New Deal Technologique (stratégie numérique du Sénégal, 2025)",
      },
      applies: (ctx) => targetsCountry(ctx, "SN") && ctx.spec.project.type === "public-service" && dataStores(ctx).length > 0,
      check: (ctx) =>
        dataStores(ctx).map((s) => {
          const country = ctx.graph.country(s);
          const name = ctx.graph.label(s.id);
          return country === "SN"
            ? pass(tr(ctx, `${name} is hosted in Senegal.`, `${name} est hébergé au Sénégal.`), { target: s.id })
            : fail(
                tr(
                  ctx,
                  `${name} is hosted ${country ? `in ${country}` : "in an undeclared country"}.`,
                  `${name} est hébergé ${country ? `en ${country}` : "dans un pays non déclaré"}.`,
                ),
                { target: s.id, observed: country },
              );
        }),
    }),

    defineRule({
      id: "sn.privacy-notice",
      title: "People informed",
      why: "People must know who processes their data, why, for how long, and how to exercise their rights.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: LOI_2008_12,
      fix: "Publish a privacy policy: controller, purposes, recipients, retention periods, rights, contact, reference of the CDP declaration.",
      fr: {
        title: "Information des personnes",
        why: "Les personnes doivent savoir qui traite leurs données, pourquoi, combien de temps, et comment exercer leurs droits.",
        fix: "Publiez une politique de confidentialité : responsable, finalités, destinataires, durées, droits, contact, référence de la déclaration CDP.",
        source: LOI_2008_12_FR,
      },
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesPersonalData(ctx),
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence(tr(ctx, "Attach the link to the privacy policy.", "Joignez le lien vers la politique de confidentialité."));
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/confidentialit/i, /donn[ée]es personnelles/i, /vie priv[ée]e/i, /privacy/i, /personal data/i, /data protection/i]);
          return link
            ? pass(tr(ctx, `Link found: "${link.text || link.href}".`, `Lien détecté : « ${link.text || link.href} ».`), { observed: link.href })
            : evidence(tr(ctx, "No link to a privacy policy found on the home page.", "Aucun lien vers une politique de confidentialité détecté sur la page d'accueil."));
        });
      },
    }),

    defineRule({
      id: "sn.legal-notice",
      title: "Publisher identified",
      why: "An online service must make it easy to identify the company or administration that publishes it.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: LOI_2008_08,
      fix: "Publish a legal notice: name, address, NINEA / RCCM numbers, contact, hosting provider.",
      fr: {
        title: "Identification de l'éditeur",
        why: "Un service en ligne doit permettre d'identifier facilement l'entreprise ou l'administration qui l'édite.",
        fix: "Publiez des mentions légales : dénomination, adresse, NINEA / RCCM, contact, hébergeur.",
        source: LOI_2008_08_FR,
      },
      applies: (ctx) => targetsCountry(ctx, "SN") && ctx.spec.project.audience !== "internal",
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence(tr(ctx, "Attach the link to the legal notice.", "Joignez le lien vers les mentions légales."));
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/mentions l[ée]gales/i, /legal/i, /[àa] propos/i, /imprint/i, /about us/i]);
          return link
            ? pass(tr(ctx, `Link found: "${link.text || link.href}".`, `Lien détecté : « ${link.text || link.href} ».`), { observed: link.href })
            : evidence(tr(ctx, "No link to a legal notice found on the home page.", "Aucun lien vers des mentions légales détecté sur la page d'accueil."));
        });
      },
    }),
  ],
});
