import { dataStores, definePack, defineRule, evidence, handlesPersonalData, isCritical, pass, tr, warn } from "@golive/packs-sdk";

const ANSSI = { label: "ANSSI, IT hygiene guide", url: "https://cyber.gouv.fr/publications/guide-dhygiene-informatique" };
const ANSSI_FR = "ANSSI, guide d'hygiène informatique";

export const operations = definePack({
  id: "operations",
  name: "Operations",
  version: "0.1.0",
  description: "Tested backups, disaster recovery, incidents and controlled deployments.",
  maintainer: "PcyBox GoLive",
  core: true,
  fr: { name: "Exploitation", description: "Sauvegardes testées, reprise d'activité, incidents et déploiements maîtrisés." },
  rules: [
    defineRule({
      id: "ops.backup.restore-tested",
      title: "Restore tested",
      why: "A backup that was never restored is only an assumption: many teams find out it is unusable on the day they need it.",
      layer: 1,
      category: "operations",
      severity: (ctx) => (isCritical(ctx) ? "blocker" : "major"),
      method: "evidence",
      source: ANSSI,
      fix: "Restore the latest backup on a clean environment, measure how long it takes, record the result.",
      fr: {
        title: "Restauration testée",
        why: "Une sauvegarde jamais restaurée n'est qu'une hypothèse : beaucoup découvrent qu'elle est inutilisable le jour où ils en ont besoin.",
        fix: "Restaurez la dernière sauvegarde sur un environnement vierge, mesurez la durée, consignez le résultat.",
        source: ANSSI_FR,
      },
      applies: (ctx) => ctx.graph.has("database", "storage"),
      check: (ctx) => evidence(tr(ctx, "Attach the report of a restore test less than 3 months old.", "Joignez le compte rendu d'un test de restauration de moins de 3 mois.")),
    }),

    defineRule({
      id: "ops.backup.offsite",
      title: "Backup outside the main provider",
      why: "If the backup sits with the same host, a major incident there takes both copies.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "auto",
      source: { label: "3-2-1 backup rule", url: "https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf" },
      fix: "Keep at least one copy with another provider or in another country.",
      fr: {
        title: "Sauvegarde hors du fournisseur principal",
        why: "Si la sauvegarde est chez le même hébergeur, un incident majeur chez lui emporte les deux copies.",
        fix: "Hébergez au moins une copie chez un autre fournisseur ou dans un autre pays.",
        source: "Règle 3-2-1 des sauvegardes",
      },
      applies: (ctx) => ctx.graph.has("backup") && dataStores(ctx).length > 0,
      check: (ctx) => {
        const providers = new Set(dataStores(ctx).map((s) => ctx.graph.provider(s)).filter(Boolean));
        const same = ctx.graph.ofKind("backup").filter((b) => {
          const p = ctx.graph.provider(b);
          return p ? providers.has(p) : false;
        });
        if (same.length) {
          const p = ctx.graph.provider(same[0]!);
          return warn(tr(ctx, `The backup is with the same provider (${p}) as the data.`, `La sauvegarde est chez le même fournisseur (${p}) que les données.`));
        }
        const unknown = ctx.graph.ofKind("backup").filter((b) => !ctx.graph.provider(b));
        if (unknown.length) return warn(tr(ctx, "Backup provider not declared.", "Fournisseur de la sauvegarde non déclaré."), { severity: "info" });
        return pass(tr(ctx, "The backup is with another provider.", "La sauvegarde est chez un autre fournisseur."));
      },
    }),

    defineRule({
      id: "ops.incident",
      title: "Written incident procedure",
      why: "During an outage or a leak, knowing who to alert and what to do in the first hour changes everything.",
      layer: 1,
      category: "operations",
      severity: "major",
      method: "evidence",
      source: { label: "NIST SP 800-61, Incident Handling", url: "https://csrc.nist.gov/pubs/sp/800/61/r3/final" },
      fix: "Write one page: contacts, on-call, steps, communication, notification to the data protection authority.",
      fr: {
        title: "Procédure d'incident écrite",
        why: "Lors d'une panne ou d'une fuite, savoir qui prévenir et quoi faire dans la première heure change tout.",
        fix: "Rédigez une page : contacts, astreinte, étapes, communication, notification à l'autorité de protection des données.",
      },
      check: (ctx) => evidence(tr(ctx, "Attach the incident handling procedure.", "Joignez la procédure de gestion d'incident.")),
    }),

    defineRule({
      id: "ops.drp",
      title: "Disaster recovery plan",
      why: "For a critical service, you must know how fast it comes back and how much data loss is acceptable.",
      layer: 1,
      category: "operations",
      severity: "major",
      method: "evidence",
      source: { label: "ISO/IEC 27031" },
      fix: "Set RTO and RPO, describe the failover and test it at least once a year.",
      fr: {
        title: "Plan de reprise d'activité",
        why: "Pour un service critique, il faut savoir en combien de temps il revient et avec quelle perte de données acceptable.",
        fix: "Fixez RTO et RPO, décrivez la bascule et testez-la au moins une fois par an.",
      },
      applies: (ctx) => isCritical(ctx),
      check: (ctx) => evidence(tr(ctx, "Attach the recovery plan with RTO / RPO and the date of the last test.", "Joignez le plan de reprise avec RTO / RPO et la date du dernier test.")),
    }),

    defineRule({
      id: "ops.rollback",
      title: "Rollback possible",
      why: "A failed deployment must be undone in minutes, not hours.",
      layer: 1,
      category: "operations",
      severity: "minor",
      method: "evidence",
      source: { label: "Google SRE Book, Release Engineering", url: "https://sre.google/sre-book/release-engineering/" },
      fix: "Version deployments and database migrations, document the rollback command.",
      fr: {
        title: "Retour arrière possible",
        why: "Un déploiement raté doit pouvoir être annulé en minutes, pas en heures.",
        fix: "Versionnez les déploiements et les migrations de base, documentez la commande de retour arrière.",
      },
      applies: (ctx) => ctx.graph.has("frontend", "backend", "api"),
      check: (ctx) => evidence(tr(ctx, "Attest the rollback procedure.", "Attestez la procédure de retour arrière.")),
    }),

    defineRule({
      id: "ops.logs-pii",
      title: "Logs free of sensitive data",
      why: "Passwords, tokens or health data in logs are a silent and lasting leak.",
      layer: 1,
      category: "data",
      severity: "minor",
      method: "evidence",
      source: { label: "OWASP Logging Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html" },
      fix: "Filter sensitive fields at the source and set a log retention period.",
      fr: {
        title: "Journaux sans données sensibles",
        why: "Mots de passe, jetons ou données de santé dans les journaux sont une fuite silencieuse et durable.",
        fix: "Filtrez les champs sensibles à la source et fixez une durée de conservation des journaux.",
      },
      applies: handlesPersonalData,
      check: (ctx) => evidence(tr(ctx, "Attest sensitive data filtering and the log retention period.", "Attestez le filtrage des données sensibles et la durée de conservation des journaux.")),
    }),
  ],
});
