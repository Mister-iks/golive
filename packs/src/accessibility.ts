import { definePack, defineRule, evidence, fail, pass, warn } from "@golive/packs-sdk";
import { withWeb } from "./util";

const wcag = (sc: string, slug: string) => ({
  label: `WCAG 2.2, critère ${sc}`,
  url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
});

export const accessibility = definePack({
  id: "accessibility",
  name: "Accessibilité",
  version: "0.1.0",
  description: "WCAG 2.2 niveau AA : contrôles automatisables et preuves d'audit manuel.",
  maintainer: "GoLive",
  rules: [
    defineRule({
      id: "a11y.lang",
      title: "Langue de la page déclarée",
      why: "Les lecteurs d'écran choisissent la voix et la prononciation à partir de la langue déclarée.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: wcag("3.1.1", "language-of-page"),
      fix: 'Ajoutez l\'attribut lang sur la balise <html>, par exemple <html lang="fr">.',
      check: (ctx) =>
        withWeb(ctx, (web) => (web.html?.lang ? pass(`lang="${web.html.lang}"`) : fail("Attribut lang absent sur <html>."))),
    }),

    defineRule({
      id: "a11y.img-alt",
      title: "Images avec alternative textuelle",
      why: "Une image sans attribut alt est invisible, ou pire lue comme un nom de fichier, pour une personne aveugle.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: wcag("1.1.1", "non-text-content"),
      fix: 'Donnez un alt descriptif aux images porteuses d\'information et alt="" aux images décoratives.',
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const n = web.html?.imagesWithoutAlt ?? 0;
          const total = web.html?.images ?? 0;
          if (n === 0) return pass(total ? `${total} images, toutes avec un attribut alt.` : "Aucune image sur la page d'accueil.");
          return fail(`${n} image${n > 1 ? "s" : ""} sur ${total} sans attribut alt.`, { observed: `${n}/${total}` });
        }),
    }),

    defineRule({
      id: "a11y.page-title",
      title: "Page titrée",
      why: "Le titre est la première information annoncée et permet de distinguer les onglets.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: wcag("2.4.2", "page-titled"),
      fix: "Donnez à chaque page un <title> qui décrit son contenu.",
      check: (ctx) => withWeb(ctx, (web) => (web.html?.title?.trim() ? pass("Titre présent.") : fail("Titre absent."))),
    }),

    defineRule({
      id: "a11y.zoom",
      title: "Zoom autorisé",
      why: "Bloquer le zoom empêche les personnes malvoyantes d'agrandir le texte sur mobile.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: wcag("1.4.4", "resize-text"),
      fix: "Retirez user-scalable=no et maximum-scale de la balise meta viewport.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const v = web.html?.viewport;
          if (!v) return warn("Balise meta viewport absente : l'affichage mobile risque d'être illisible.", { severity: "minor" });
          const max = Number(/maximum-scale\s*=\s*([\d.]+)/i.exec(v)?.[1] ?? 10);
          if (/user-scalable\s*=\s*(no|0)/i.test(v) || max < 2) return fail("Le zoom est bloqué par la balise viewport.", { observed: v });
          return pass("Le zoom est autorisé.");
        }),
    }),

    defineRule({
      id: "a11y.manual-audit",
      title: "Audit manuel réalisé",
      why: "Les robots ne détectent qu'environ un tiers des problèmes : navigation clavier, contrastes et formulaires demandent un humain.",
      layer: 1,
      category: "quality",
      severity: (ctx) => (ctx.spec.project.type === "public-service" ? "major" : "minor"),
      method: "evidence",
      source: { label: "W3C WAI, Evaluating Web Accessibility", url: "https://www.w3.org/WAI/test-evaluate/" },
      fix: "Faites tester les parcours principaux au clavier et avec un lecteur d'écran, consignez les résultats.",
      applies: (ctx) => ctx.spec.project.audience !== "internal",
      check: () => evidence("Joignez le rapport d'audit manuel des parcours principaux."),
    }),

    defineRule({
      id: "a11y.statement",
      title: "Déclaration d'accessibilité publiée",
      why: "Elle informe les usagers du niveau de conformité et leur donne un moyen de signaler un blocage.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: { label: "Directive (UE) 2016/2102 et European Accessibility Act", url: "https://eur-lex.europa.eu/eli/dir/2019/882/oj" },
      fix: "Publiez une page « Accessibilité » : niveau de conformité, contenus non accessibles, contact et voie de recours.",
      applies: (ctx) => ctx.spec.project.type === "public-service" || ctx.spec.project.type === "ecommerce",
      check: () => evidence("Joignez le lien vers la déclaration d'accessibilité."),
    }),
  ],
});
