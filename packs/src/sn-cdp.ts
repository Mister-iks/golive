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
  warn,
  type Finding,
} from "@golive/packs-sdk";
import { findLink, list, withWeb } from "./util";

const LOI_2008_12 = { label: "Loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel", url: "https://www.cdp.sn" };
const LOI_2008_08 = { label: "Loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques" };

export const snCdp = definePack({
  id: "sn-cdp",
  name: "Sénégal",
  version: "0.1.0",
  description: "Loi 2008-12 et formalités auprès de la CDP, mentions des sites marchands, hébergement des données publiques.",
  maintainer: "GoLive (pack communautaire, revue juridique à venir)",
  countries: ["SN"],
  rules: [
    defineRule({
      id: "sn.cdp.declaration",
      title: "Traitement déclaré à la CDP",
      why: "Au Sénégal, un traitement de données personnelles doit faire l'objet d'une formalité préalable auprès de la Commission de protection des données personnelles.",
      layer: 1,
      category: "legal",
      severity: "blocker",
      method: "evidence",
      legal: true,
      source: LOI_2008_12,
      fix: "Effectuez la déclaration (ou la demande d'avis / d'autorisation selon le cas) auprès de la CDP avant l'ouverture du service.",
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesPersonalData(ctx),
      check: () => evidence("Joignez le récépissé de déclaration ou la décision de la CDP."),
    }),

    defineRule({
      id: "sn.cdp.authorisation",
      title: "Autorisation pour les données sensibles",
      why: "Les données de santé, biométriques, d'identification nationale ou judiciaires relèvent d'un régime d'autorisation préalable, plus strict que la simple déclaration.",
      layer: 1,
      category: "legal",
      severity: "blocker",
      method: "evidence",
      legal: true,
      source: LOI_2008_12,
      fix: "Déposez une demande d'autorisation auprès de la CDP en décrivant finalités, mesures de sécurité et durées de conservation.",
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesSensitiveData(ctx),
      check: (ctx) => evidence(`Données concernées : ${list(ctx.spec.data.sensitive)}. Joignez l'autorisation de la CDP.`),
    }),

    defineRule({
      id: "sn.cdp.transfer",
      title: "Transfert de données hors du Sénégal encadré",
      why: "Héberger des données de personnes au Sénégal dans un autre pays constitue un transfert, soumis à conditions et souvent à autorisation.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: LOI_2008_12,
      fix: "Hébergez les données au Sénégal, ou obtenez l'autorisation de transfert de la CDP et documentez les garanties.",
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesPersonalData(ctx) && dataStores(ctx).length > 0,
      check: (ctx) => {
        const out: Finding[] = [];
        for (const s of dataStores(ctx)) {
          const country = ctx.graph.country(s);
          if (!country) out.push(warn(`Pays d'hébergement de ${ctx.graph.label(s.id)} non déclaré.`, { target: s.id }));
          else if (country !== "SN") out.push(evidence(`${ctx.graph.label(s.id)} est hébergé hors du Sénégal (${country}).`, { target: s.id, observed: country }));
          else out.push(pass(`${ctx.graph.label(s.id)} est hébergé au Sénégal.`, { target: s.id }));
        }
        return out;
      },
    }),

    defineRule({
      id: "sn.public.hosting",
      title: "Données d'un service public hébergées au Sénégal",
      why: "La souveraineté numérique est un axe majeur de la stratégie nationale : les données d'un service public ont vocation à rester sur le territoire.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "auto",
      legal: true,
      source: { label: "New Deal Technologique (stratégie numérique du Sénégal, 2025)", url: "https://primature.sn/publications/actualites/strategie-numerique-du-senegal-le-new-deal-technologique-horizon-2034" },
      fix: "Hébergez bases et stockages au datacenter national ou chez un hébergeur établi au Sénégal.",
      applies: (ctx) => targetsCountry(ctx, "SN") && ctx.spec.project.type === "public-service" && dataStores(ctx).length > 0,
      check: (ctx) =>
        dataStores(ctx).map((s) => {
          const country = ctx.graph.country(s);
          return country === "SN"
            ? pass(`${ctx.graph.label(s.id)} est hébergé au Sénégal.`, { target: s.id })
            : fail(`${ctx.graph.label(s.id)} est hébergé ${country ? `en ${country}` : "dans un pays non déclaré"}.`, { target: s.id, observed: country });
        }),
    }),

    defineRule({
      id: "sn.privacy-notice",
      title: "Information des personnes",
      why: "Les personnes doivent savoir qui traite leurs données, pourquoi, combien de temps, et comment exercer leurs droits.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: LOI_2008_12,
      fix: "Publiez une politique de confidentialité : responsable, finalités, destinataires, durées, droits, contact, référence de la déclaration CDP.",
      applies: (ctx) => targetsCountry(ctx, "SN") && handlesPersonalData(ctx),
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence("Joignez le lien vers la politique de confidentialité.");
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/confidentialit/i, /donn[ée]es personnelles/i, /vie priv[ée]e/i, /privacy/i]);
          return link
            ? pass(`Lien détecté : « ${link.text || link.href} ».`, { observed: link.href })
            : evidence("Aucun lien vers une politique de confidentialité détecté sur la page d'accueil.");
        });
      },
    }),

    defineRule({
      id: "sn.legal-notice",
      title: "Identification de l'éditeur",
      why: "Un service en ligne doit permettre d'identifier facilement l'entreprise ou l'administration qui l'édite.",
      layer: 3,
      category: "legal",
      severity: "major",
      method: "hybrid",
      legal: true,
      source: LOI_2008_08,
      fix: "Publiez des mentions légales : dénomination, adresse, NINEA / RCCM, contact, hébergeur.",
      applies: (ctx) => targetsCountry(ctx, "SN") && ctx.spec.project.audience !== "internal",
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence("Joignez le lien vers les mentions légales.");
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/mentions l[ée]gales/i, /legal/i, /[àa] propos/i, /imprint/i]);
          return link
            ? pass(`Lien détecté : « ${link.text || link.href} ».`, { observed: link.href })
            : evidence("Aucun lien vers des mentions légales détecté sur la page d'accueil.");
        });
      },
    }),
  ],
});
