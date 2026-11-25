import { defineMessages } from "../index";

export const rulesMessages = defineMessages({
  en: {
    title: "Rule catalogue",
    search: "Search a rule, a source…",
    packs: "Packs",
    allPacks: "All packs",
    openPacks: "Packs are open (Apache-2.0) and versioned. A rule is contributed by pull request, with its tests.",
    reviewed: (date: string) => `reviewed on ${date}`,
    legalPending: "legal review pending",
    none: "No rule matches.",
    layer: (n: number, name: string) => `Layer ${n} · ${name}`,
    layers: { 1: "Architecture", 2: "Code", 3: "Live site", 4: "AI" } as Record<number, string>,
    methods: { auto: "Automatic", evidence: "Proof", hybrid: "Automatic or proof" },
    byProfile: "by profile",
  },
  fr: {
    title: "Catalogue des règles",
    search: "Rechercher une règle, une source…",
    packs: "Packs",
    allPacks: "Tous les packs",
    openPacks: "Les packs sont ouverts (Apache-2.0) et versionnés. Une règle se contribue par pull request, avec ses tests.",
    reviewed: (date: string) => `revu le ${date}`,
    legalPending: "revue juridique à venir",
    none: "Aucune règle ne correspond.",
    layer: (n: number, name: string) => `Couche ${n} · ${name}`,
    layers: { 1: "Architecture", 2: "Code", 3: "Site en ligne", 4: "IA" },
    methods: { auto: "Automatique", evidence: "Preuve", hybrid: "Automatique ou preuve" },
    byProfile: "selon profil",
  },
});
