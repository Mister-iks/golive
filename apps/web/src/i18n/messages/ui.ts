import type { Decision } from "@golive/engine";
import type { Severity, Status } from "@golive/packs-sdk";
import { defineMessages } from "../index";

export const uiMessages = defineMessages({
  en: {
    severity: { blocker: "Blocker", major: "Major", minor: "Minor", info: "Info" } as Record<Severity, string>,
    status: {
      pass: "OK",
      warn: "Warning",
      fail: "Failed",
      na: "Not applicable",
      evidence: "Proof required",
      "not-run": "Not run",
    } as Record<Status, string>,
    decision: { go: "Go", conditional: "Conditional Go", "no-go": "No-Go" } as Record<Decision, string>,
    close: "Close",
    score: (value: number) => `Score ${value} out of 100`,
  },
  fr: {
    severity: { blocker: "Bloquant", major: "Majeur", minor: "Mineur", info: "Info" },
    status: {
      pass: "OK",
      warn: "Avertissement",
      fail: "Échec",
      na: "Non applicable",
      evidence: "Preuve requise",
      "not-run": "Non exécuté",
    },
    decision: { go: "Go", conditional: "Go conditionnel", "no-go": "No-Go" },
    close: "Fermer",
    score: (value: number) => `Score ${value} sur 100`,
  },
});
