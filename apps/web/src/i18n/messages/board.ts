import { defineMessages } from "../index";

export const boardMessages = defineMessages({
  en: {
    columns: {
      todo: { label: "To do", hint: "Created by the audit" },
      doing: { label: "In progress", hint: "" },
      review: { label: "To verify", hint: "Run the audit again to confirm" },
      done: { label: "Done", hint: "Closed by the audit" },
    },
    milestones: { 1: "Design", 2: "Development", 3: "Pre-production", 4: "Go / No-Go" } as Record<number, string>,
    emptyTitle: "No tasks",
    emptyBody: "Tasks appear automatically for every failed check or missing proof.",
    findings: (n: number) => `${n} findings`,
    regression: "Regression: fixed, then back again",
    unconfirmed: "Moved by hand: not confirmed by the audit",
    closedByAudit: "Closed automatically by the audit",
  },
  fr: {
    columns: {
      todo: { label: "À faire", hint: "Générées par l'audit" },
      doing: { label: "En cours", hint: "" },
      review: { label: "À vérifier", hint: "Relancez l'audit pour confirmer" },
      done: { label: "Fait", hint: "Fermées par l'audit" },
    },
    milestones: { 1: "Conception", 2: "Développement", 3: "Pré-prod", 4: "Go / No-Go" },
    emptyTitle: "Aucune tâche",
    emptyBody: "Les tâches apparaissent automatiquement pour chaque contrôle en échec ou preuve manquante.",
    findings: (n: number) => `${n} constats`,
    regression: "Régression : corrigé puis réapparu",
    unconfirmed: "Déplacée à la main : non confirmé par l'audit",
    closedByAudit: "Fermée automatiquement par l'audit",
  },
});
