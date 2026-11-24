import { dataStores, definePack, defineRule, evidence, handlesPersonalData, isCritical, pass, warn } from "@golive/packs-sdk";

const ANSSI = { label: "ANSSI, guide d'hygiène informatique", url: "https://cyber.gouv.fr/publications/guide-dhygiene-informatique" };

export const operations = definePack({
  id: "operations",
  name: "Exploitation",
  version: "0.1.0",
  description: "Sauvegardes testées, reprise d'activité, incidents et déploiements maîtrisés.",
  maintainer: "PcyBox GoLive",
  core: true,
  rules: [
    defineRule({
      id: "ops.backup.restore-tested",
      title: "Restauration testée",
      why: "Une sauvegarde jamais restaurée n'est qu'une hypothèse : beaucoup découvrent qu'elle est inutilisable le jour où ils en ont besoin.",
      layer: 1,
      category: "operations",
      severity: (ctx) => (isCritical(ctx) ? "blocker" : "major"),
      method: "evidence",
      source: ANSSI,
      fix: "Restaurez la dernière sauvegarde sur un environnement vierge, mesurez la durée, consignez le résultat.",
      applies: (ctx) => ctx.graph.has("database", "storage"),
      check: () => evidence("Joignez le compte rendu d'un test de restauration de moins de 3 mois."),
    }),

    defineRule({
      id: "ops.backup.offsite",
      title: "Sauvegarde hors du fournisseur principal",
      why: "Si la sauvegarde est chez le même hébergeur, un incident majeur chez lui emporte les deux copies.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "auto",
      source: { label: "Règle 3-2-1 des sauvegardes", url: "https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf" },
      fix: "Hébergez au moins une copie chez un autre fournisseur ou dans un autre pays.",
      applies: (ctx) => ctx.graph.has("backup") && dataStores(ctx).length > 0,
      check: (ctx) => {
        const providers = new Set(dataStores(ctx).map((s) => ctx.graph.provider(s)).filter(Boolean));
        const same = ctx.graph.ofKind("backup").filter((b) => {
          const p = ctx.graph.provider(b);
          return p ? providers.has(p) : false;
        });
        if (same.length) return warn(`La sauvegarde est chez le même fournisseur (${ctx.graph.provider(same[0]!)}) que les données.`);
        const unknown = ctx.graph.ofKind("backup").filter((b) => !ctx.graph.provider(b));
        if (unknown.length) return warn("Fournisseur de la sauvegarde non déclaré.", { severity: "info" });
        return pass("La sauvegarde est chez un autre fournisseur.");
      },
    }),

    defineRule({
      id: "ops.incident",
      title: "Procédure d'incident écrite",
      why: "Lors d'une panne ou d'une fuite, savoir qui prévenir et quoi faire dans la première heure change tout.",
      layer: 1,
      category: "operations",
      severity: "major",
      method: "evidence",
      source: { label: "NIST SP 800-61, Incident Handling", url: "https://csrc.nist.gov/pubs/sp/800/61/r3/final" },
      fix: "Rédigez une page : contacts, astreinte, étapes, communication, notification à l'autorité de protection des données.",
      check: () => evidence("Joignez la procédure de gestion d'incident."),
    }),

    defineRule({
      id: "ops.drp",
      title: "Plan de reprise d'activité",
      why: "Pour un service critique, il faut savoir en combien de temps il revient et avec quelle perte de données acceptable.",
      layer: 1,
      category: "operations",
      severity: "major",
      method: "evidence",
      source: { label: "ISO/IEC 27031" },
      fix: "Fixez RTO et RPO, décrivez la bascule et testez-la au moins une fois par an.",
      applies: (ctx) => isCritical(ctx),
      check: () => evidence("Joignez le plan de reprise avec RTO / RPO et la date du dernier test."),
    }),

    defineRule({
      id: "ops.rollback",
      title: "Retour arrière possible",
      why: "Un déploiement raté doit pouvoir être annulé en minutes, pas en heures.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "evidence",
      source: { label: "Google SRE Book, Release Engineering", url: "https://sre.google/sre-book/release-engineering/" },
      fix: "Versionnez les déploiements et les migrations de base, documentez la commande de retour arrière.",
      applies: (ctx) => ctx.graph.has("frontend", "backend", "api"),
      check: () => evidence("Attestez la procédure de retour arrière."),
    }),

    defineRule({
      id: "ops.logs-pii",
      title: "Journaux sans données sensibles",
      why: "Mots de passe, jetons ou données de santé dans les journaux sont une fuite silencieuse et durable.",
      layer: 1,
      category: "data",
      severity: "minor",
      method: "evidence",
      source: { label: "OWASP Logging Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html" },
      fix: "Filtrez les champs sensibles à la source et fixez une durée de conservation des journaux.",
      applies: handlesPersonalData,
      check: () => evidence("Attestez le filtrage des données sensibles et la durée de conservation des journaux."),
    }),
  ],
});
