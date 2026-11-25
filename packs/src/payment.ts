import { parseTech } from "@golive/spec";
import { definePack, defineRule, evidence, fail, hasFeature, pass, tr } from "@golive/packs-sdk";
import { findLink, withWeb } from "./util";

const PCI = { label: "PCI DSS v4.0.1, SAQ A", url: "https://www.pcisecuritystandards.org/" };
const MOBILE_MONEY = new Set(["wave", "orange-money", "paydunya", "cinetpay", "mtn-momo", "free-money"]);

export const payment = definePack({
  id: "payment",
  name: "Payment",
  version: "0.1.0",
  description: "Payment providers (card and mobile money) and merchant obligations.",
  maintainer: "PcyBox GoLive",
  fr: { name: "Paiement", description: "Intégration des prestataires de paiement (carte et mobile money) et obligations du marchand." },
  rules: [
    defineRule({
      id: "pay.psp",
      title: "Payments handled by a provider",
      why: "Processing card numbers yourself brings the whole PCI DSS standard into scope, out of reach for most projects.",
      layer: 1,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: PCI,
      fix: "Add a payment provider (Stripe, Wave, Orange Money, PayDunya…) and use its hosted page or fields.",
      fr: {
        title: "Paiement confié à un prestataire",
        why: "Traiter soi-même des numéros de carte impose toute la norme PCI DSS : hors de portée de la plupart des projets.",
        fix: "Ajoutez un prestataire de paiement (Stripe, Wave, Orange Money, PayDunya…) et utilisez sa page ou ses champs hébergés.",
      },
      applies: (ctx) => hasFeature(ctx, "payment"),
      check: (ctx) => {
        const psps = ctx.graph.ofKind("payment");
        const list = psps.map((p) => p.tech ?? p.id).join(", ");
        return psps.length
          ? pass(tr(ctx, `Provider${psps.length > 1 ? "s" : ""}: ${list}.`, `Prestataire${psps.length > 1 ? "s" : ""} : ${list}.`))
          : fail(tr(ctx, "Payment declared without a provider: who handles card data?", "Paiement déclaré sans prestataire : qui traite les données de carte ?"));
      },
    }),

    defineRule({
      id: "pay.hosted-fields",
      title: "Card data never reaches your servers",
      why: "With a page or fields hosted by the provider, your PCI scope shrinks to the SAQ A questionnaire.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "evidence",
      source: PCI,
      fix: "Use the provider's Checkout, Payment Element or redirect; never collect the card number yourself.",
      fr: {
        title: "Les données de carte ne transitent pas par vos serveurs",
        why: "Avec une page ou des champs hébergés par le prestataire, votre périmètre PCI se réduit au questionnaire SAQ A.",
        fix: "Utilisez Checkout, Payment Element ou la redirection du prestataire ; ne collectez jamais le numéro de carte vous-même.",
      },
      applies: (ctx) => ctx.graph.has("payment"),
      check: (ctx) =>
        evidence(
          tr(ctx, "Attest that card entry happens on a page or fields hosted by the provider.", "Attestez que la saisie de carte se fait sur une page ou des champs hébergés par le prestataire."),
        ),
    }),

    defineRule({
      id: "pay.webhooks",
      title: "Authenticated payment notifications",
      why: "An unverified webhook lets anyone mark an order as paid.",
      layer: 1,
      category: "security",
      severity: "blocker",
      method: "evidence",
      source: { label: "Stripe, webhook signature verification", url: "https://docs.stripe.com/webhooks#verify-official-libraries" },
      fix: "Verify the signature of every notification and confirm the status with the provider's API before delivering.",
      fr: {
        title: "Notifications de paiement authentifiées",
        why: "Un webhook non vérifié permet à n'importe qui de faire passer une commande pour payée.",
        fix: "Vérifiez la signature de chaque notification et confirmez le statut auprès de l'API du prestataire avant de livrer.",
        source: "Stripe, vérification des signatures de webhook",
      },
      applies: (ctx) => ctx.graph.has("payment"),
      check: (ctx) =>
        evidence(
          tr(ctx, "Attest signature verification and server-to-server payment confirmation.", "Attestez la vérification des signatures et la confirmation serveur à serveur des paiements."),
        ),
    }),

    defineRule({
      id: "pay.mobile-money-reconciliation",
      title: "Mobile money payments reconciled",
      why: "Mobile money confirmations can arrive late or never: without reconciliation, orders stay stuck.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "evidence",
      source: { label: "PcyBox GoLive good practice" },
      fix: "Poll the provider's API for pending transactions and handle expirations.",
      fr: {
        title: "Rapprochement des paiements mobile money",
        why: "Les confirmations mobile money peuvent arriver en retard ou jamais : sans rapprochement, des commandes restent bloquées.",
        fix: "Interrogez périodiquement l'API du prestataire pour les transactions en attente et gérez les expirations.",
        source: "Bonnes pratiques PcyBox GoLive",
      },
      applies: (ctx) => ctx.graph.ofKind("payment").some((p) => MOBILE_MONEY.has(parseTech(p.tech)?.name ?? "")),
      check: (ctx) => evidence(tr(ctx, "Attest how pending payments are handled and the daily reconciliation.", "Attestez le traitement des paiements en attente et le rapprochement quotidien.")),
    }),

    defineRule({
      id: "pay.terms",
      title: "Terms of sale available",
      why: "Customers must accept known terms before paying: they are the basis of any dispute or refund.",
      layer: 3,
      category: "legal",
      severity: "blocker",
      method: "hybrid",
      legal: true,
      source: { label: "Law No. 2008-08 (Senegal); Consumer Code L221-5 (France)" },
      fix: "Publish terms of sale (prices, delivery, withdrawal, complaints) and link them from the footer and the payment step.",
      fr: {
        title: "Conditions générales de vente accessibles",
        why: "Le client doit accepter des conditions connues avant de payer : c'est la base de tout litige ou remboursement.",
        fix: "Publiez des CGV (prix, livraison, rétractation, réclamations) et liez-les depuis le pied de page et l'étape de paiement.",
        source: "Loi n° 2008-08 (Sénégal) ; Code de la consommation L221-5 (France)",
      },
      applies: (ctx) => hasFeature(ctx, "payment"),
      check: (ctx) => {
        if (!ctx.web?.ok) return evidence(tr(ctx, "Attach the link to the terms of sale.", "Joignez le lien vers les conditions générales de vente."));
        return withWeb(ctx, (web) => {
          const link = findLink(web, [/\bcgv\b/i, /conditions (g[ée]n[ée]rales )?de vente/i, /terms (and conditions )?of sale/i, /conditions-generales-de-vente/i]);
          return link
            ? pass(tr(ctx, `Link found: "${link.text || link.href}".`, `Lien détecté : « ${link.text || link.href} ».`), { observed: link.href })
            : evidence(tr(ctx, "No link to terms of sale found on the home page.", "Aucun lien vers des CGV détecté sur la page d'accueil."));
        });
      },
    }),
  ],
});
