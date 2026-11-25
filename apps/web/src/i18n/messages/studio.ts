import { defineMessages } from "../index";

const s = (n: number) => (n > 1 ? "s" : "");

export const studioMessages = defineMessages({
  en: {
    emptyTitle: "Empty canvas",
    emptyBody: "Drag components from the library, then connect them by pulling from their edges.",
    components: (n: number) => `${n} component${s(n)}`,
    flows: (n: number) => `${n} flow${s(n)}`,
    blockersOnCanvas: (n: number) => `${n} blocker${s(n)} on the diagram`,
    library: "Component library",
    actors: "Actors",
    searchPlaceholder: "Component or technology…",
    searchLabel: "Search a component",
    addHint: (hint: string) => `${hint}. Drag onto the canvas or click to add.`,
    noResult: "No results.",
    techUnknown: "technology to specify",
    reachable: "Reachable from the Internet",
    internal: "internal",
  },
  fr: {
    emptyTitle: "Canevas vide",
    emptyBody: "Glissez des composants depuis la bibliothèque, puis reliez-les en tirant depuis leurs bords.",
    components: (n: number) => `${n} composant${s(n)}`,
    flows: (n: number) => `${n} flux`,
    blockersOnCanvas: (n: number) => `${n} bloquant${s(n)} sur le schéma`,
    library: "Bibliothèque de composants",
    actors: "Acteurs",
    searchPlaceholder: "Composant ou techno…",
    searchLabel: "Rechercher un composant",
    addHint: (hint: string) => `${hint}. Glissez sur le canevas ou cliquez pour ajouter.`,
    noResult: "Aucun résultat.",
    techUnknown: "technologie à préciser",
    reachable: "Joignable depuis Internet",
    internal: "interne",
  },
});
