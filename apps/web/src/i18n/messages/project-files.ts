import { defineMessages } from "../index";

const s = (n: number) => (n > 1 ? "s" : "");

/** New project dialog, golive.yaml import and the YAML editor. */
export const projectFilesMessages = defineMessages({
  en: {
    newProject: "New project",
    newProjectDesc: "Start from a typical architecture, you will adapt it in the Studio.",
    namePlaceholder: "Project name (optional)",
    importYaml: "Import golive.yaml",
    invalidFile: "Invalid file",
    invalidFileDesc: "This file is not a valid GoLive Spec.",
    line: (n: number) => `line ${n}: `,
    yamlErrors: (n: number) => `${n} error${s(n)}. The Studio keeps the last valid version.`,
    yamlValid: "Valid GoLive Spec, in sync with the Studio.",
    copy: "Copy",
    download: "Download",
    editorLabel: "golive.yaml editor",
  },
  fr: {
    newProject: "Nouveau projet",
    newProjectDesc: "Partez d'une architecture type, vous l'adapterez dans le Studio.",
    namePlaceholder: "Nom du projet (facultatif)",
    importYaml: "Importer golive.yaml",
    invalidFile: "Fichier invalide",
    invalidFileDesc: "Ce fichier n'est pas un GoLive Spec valide.",
    line: (n: number) => `ligne ${n} : `,
    yamlErrors: (n: number) => `${n} erreur${s(n)}. Le Studio garde la dernière version valide.`,
    yamlValid: "GoLive Spec valide, synchronisé avec le Studio.",
    copy: "Copier",
    download: "Télécharger",
    editorLabel: "Éditeur golive.yaml",
  },
});
