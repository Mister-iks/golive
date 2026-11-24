import { parseTech } from "@golive/spec";
import { definePack, defineRule, evidence, fail, hasFeature, pass } from "@golive/packs-sdk";
import { findLink, withWeb } from "./util";

const PCI = { label: "PCI DSS v4.0.1, SAQ A", url: "https://www.pcisecuritystandards.org/" };
const MOBILE_MONEY = new Set(["wave", "orange-money", "paydunya", "cinetpay", "mtn-momo", "free-money"]);

export const payment = definePack({
  id: "payment",
  name: "Paiement",
  version: "0.1.0",
  description: "Intégration des prestataires de paiement (carte et mobile money) et obligations du marchand.",
  maintainer: "GoLive",
  rules: [
    defineRule({
      id: "pay.psp",
      title: "Paiement confié à un prestataire",
      why: "Traiter soi-même des numéros de carte impose toute la norme PCI DSS : hors de portée de la plupart des projets.",
      layer: 1,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: PCI,
      fix: "Ajoutez un prestataire de paiement (Stripe, Wave, Orange Money, PayDunya…) et utilisez sa page ou ses champs hébergés.",
      applies: (ctx) => hasFeature(ctx, "payment"),
      check: (ctx) => {
        const psps = ctx.graph.ofKind("payment");
        return psps.length
          ? pass(`Prestataire${psps.length > 1 ? "s" : ""} : ${psps.map((p) => p.tech ?? p.id).join(", ")}.`)
          : fail("Paiement déclaré sans prestataire : qui traite les données de carte ?");
      },
    }),

    defineRule({
      id: "pay.hosted-fields",
      title: "Les données de carte ne transitent pas par vos serveurs",
      why: "Avec une page ou des champs hébergés par le prestataire, votre périmètre PCI se réduit au questionnaire SAQ A.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "evidence",
      source: PCI,
      fix: "Utilisez Checkout, Payment Element ou la redirection du prestataire ; ne collectez jamais le numéro de carte vous-même.",
      applies: (ctx) => ctx.graph.has("payment"),
      check: () => evidence("Attestez que la saisie de carte se fait sur une page ou des champs hébergés par le prestataire."),
    }),

    defineRule({
      id: "pay.webhooks",
      title: "Notifications de paiement authentifiées",
      why: "Un webhook non vérifié permet à n'importe qui de faire passer une commande pour payée.",
      layer: 1,
      category: "security",
      severity: "blocker",
      method: "evidence",
      source: { label: "Stripe, vérification des signatures de webhook", url: "https://docs.stripe.com/webhooks#verify-official-libraries" },
      fix: "Vérifiez la signature de chaque notification et confirmez le statut auprès de l'API du prestataire avant de livrer.",
      applies: (ctx) => ctx.graph.has("payment"),
      check: () => evidence("Attestez la vérification des signatures et la confirmation serveur à serveur des paiements."),
    }),

    defineRule({
      id: "pay.mobile-money-reconciliation",
      title: "Rapprochement des paiements mobile money",
      why: "Les confirmations mobile money peuvent arriver en retard ou jamais : sans rapprochement, des commandes restent bloquées.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "evidence",
      source: { label: "Bonnes pratiques GoLive" },
      fix: "Interrogez périodiquement l'API du prestataire pour les transactions en attente et gérez les expirations.",
      applies: (ctx) => ctx.graph.ofKind("payment").some((p) => MOBILE_MONEY.has(parseTech(p.tech)?.name ?? "")),
      check: () => evidence("Attestez le traitement des paiements en attente et le rapprochement quotidien."),
    }),

    defineRule({
      id: "pay.terms",
      title: "Conditions générales de vente accessibles",
      why: "Le client doit accepter des conditions connues avant de payer : c'est la base de tout litige ou remboursement.",
      layer: 3,
      category: "legal",
      severity: "blocker",
      method: "hybrid",
      legal: true,
      source: { label: "Loi n° 2008-08 (Sénégal) ; Code de la consommation L221-5 (France)" },
      fix: "Publiez des CGV (prix, livraison, rétractation, réclamations) et liez-les depuis le pied de page et l'étape de paiement.",
      applies: (ctx) => hasFeature(ctx, "payment"),
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence("Joignez le lien vers les conditions générales de vente.");
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/\bcgv\b/i, /conditions (g[ée]n[ée]rales )?de vente/i, /terms (and conditions )?of sale/i, /conditions-generales-de-vente/i]);
          return link
            ? pass(`Lien détecté : « ${link.text || link.href} ».`, { observed: link.href })
            : evidence("Aucun lien vers des CGV détecté sur la page d'accueil.");
        });
      },
    }),
  ],
});
