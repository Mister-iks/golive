import { definePack, defineRule, evidence, fail, pass, tr, warn, type AxeViolation, type Finding, type Severity } from "@golive/packs-sdk";
import { pathOf, plural, withCrawl, withWeb } from "./util";

const wcag = (sc: string, slug: string) => ({
  label: `WCAG 2.2, success criterion ${sc}`,
  url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
});
const wcagFr = (sc: string) => `WCAG 2.2, critère ${sc}`;

export const accessibility = definePack({
  id: "accessibility",
  name: "Accessibility",
  version: "0.1.0",
  description: "WCAG 2.2 level AA: automated checks and manual audit evidence.",
  maintainer: "PcyBox GoLive",
  fr: { name: "Accessibilité", description: "WCAG 2.2 niveau AA : contrôles automatisables et preuves d'audit manuel." },
  rules: [
    defineRule({
      id: "a11y.lang",
      title: "Page language declared",
      why: "Screen readers pick the voice and pronunciation from the declared language.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: wcag("3.1.1", "language-of-page"),
      fix: 'Add the lang attribute to the <html> tag, for example <html lang="en">.',
      fr: {
        title: "Langue de la page déclarée",
        why: "Les lecteurs d'écran choisissent la voix et la prononciation à partir de la langue déclarée.",
        fix: 'Ajoutez l\'attribut lang sur la balise <html>, par exemple <html lang="fr">.',
        source: wcagFr("3.1.1"),
      },
      check: (ctx) =>
        withWeb(ctx, (web) =>
          web.html?.lang ? pass(`lang="${web.html.lang}"`) : fail(tr(ctx, "No lang attribute on <html>.", "Attribut lang absent sur <html>.")),
        ),
    }),

    defineRule({
      id: "a11y.img-alt",
      title: "Images have a text alternative",
      why: "An image without an alt attribute is invisible to a blind person, or worse, read out as a file name.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: wcag("1.1.1", "non-text-content"),
      fix: 'Give informative images a descriptive alt and decorative images alt="".',
      fr: {
        title: "Images avec alternative textuelle",
        why: "Une image sans attribut alt est invisible, ou pire lue comme un nom de fichier, pour une personne aveugle.",
        fix: 'Donnez un alt descriptif aux images porteuses d\'information et alt="" aux images décoratives.',
        source: wcagFr("1.1.1"),
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const n = web.html?.imagesWithoutAlt ?? 0;
          const total = web.html?.images ?? 0;
          if (n === 0)
            return pass(
              total
                ? tr(ctx, `${total} images, all with an alt attribute.`, `${total} images, toutes avec un attribut alt.`)
                : tr(ctx, "No images on the home page.", "Aucune image sur la page d'accueil."),
            );
          return fail(
            tr(ctx, `${n} image${n > 1 ? "s" : ""} out of ${total} without an alt attribute.`, `${n} image${n > 1 ? "s" : ""} sur ${total} sans attribut alt.`),
            { observed: `${n}/${total}` },
          );
        }),
    }),

    defineRule({
      id: "a11y.page-title",
      title: "Page has a title",
      why: "The title is the first thing announced and tells tabs apart.",
      layer: 3,
      category: "quality",
      severity: "minor",
      method: "auto",
      source: wcag("2.4.2", "page-titled"),
      fix: "Give every page a <title> that describes its content.",
      fr: {
        title: "Page titrée",
        why: "Le titre est la première information annoncée et permet de distinguer les onglets.",
        fix: "Donnez à chaque page un <title> qui décrit son contenu.",
        source: wcagFr("2.4.2"),
      },
      check: (ctx) =>
        withWeb(ctx, (web) =>
          web.html?.title?.trim() ? pass(tr(ctx, "Title present.", "Titre présent.")) : fail(tr(ctx, "No title.", "Titre absent.")),
        ),
    }),

    defineRule({
      id: "a11y.zoom",
      title: "Zoom allowed",
      why: "Blocking zoom stops people with low vision from enlarging text on mobile.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: wcag("1.4.4", "resize-text"),
      fix: "Remove user-scalable=no and maximum-scale from the viewport meta tag.",
      fr: {
        title: "Zoom autorisé",
        why: "Bloquer le zoom empêche les personnes malvoyantes d'agrandir le texte sur mobile.",
        fix: "Retirez user-scalable=no et maximum-scale de la balise meta viewport.",
        source: wcagFr("1.4.4"),
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const v = web.html?.viewport;
          if (!v)
            return warn(
              tr(ctx, "No viewport meta tag: the page may be unreadable on mobile.", "Balise meta viewport absente : l'affichage mobile risque d'être illisible."),
              { severity: "minor" },
            );
          const max = Number(/maximum-scale\s*=\s*([\d.]+)/i.exec(v)?.[1] ?? 10);
          if (/user-scalable\s*=\s*(no|0)/i.test(v) || max < 2)
            return fail(tr(ctx, "Zoom is blocked by the viewport tag.", "Le zoom est bloqué par la balise viewport."), { observed: v });
          return pass(tr(ctx, "Zoom is allowed.", "Le zoom est autorisé."));
        }),
    }),

    defineRule({
      id: "a11y.manual-audit",
      title: "Manual audit carried out",
      why: "Robots catch only about a third of the problems: keyboard navigation, contrast and forms need a human.",
      layer: 1,
      category: "quality",
      severity: (ctx) => (ctx.spec.project.type === "public-service" ? "major" : "minor"),
      method: "evidence",
      source: { label: "W3C WAI, Evaluating Web Accessibility", url: "https://www.w3.org/WAI/test-evaluate/" },
      fix: "Have the main user journeys tested with a keyboard and a screen reader, and record the results.",
      fr: {
        title: "Audit manuel réalisé",
        why: "Les robots ne détectent qu'environ un tiers des problèmes : navigation clavier, contrastes et formulaires demandent un humain.",
        fix: "Faites tester les parcours principaux au clavier et avec un lecteur d'écran, consignez les résultats.",
      },
      applies: (ctx) => ctx.spec.project.audience !== "internal",
      check: (ctx) =>
        evidence(tr(ctx, "Attach the manual audit report of the main user journeys.", "Joignez le rapport d'audit manuel des parcours principaux.")),
    }),

    defineRule({
      id: "a11y.statement",
      title: "Accessibility statement published",
      why: "It tells users the level of compliance and gives them a way to report a blocker.",
      layer: 1,
      category: "legal",
      severity: "major",
      method: "evidence",
      legal: true,
      source: { label: "Directive (EU) 2016/2102 and European Accessibility Act", url: "https://eur-lex.europa.eu/eli/dir/2019/882/oj" },
      fix: 'Publish an "Accessibility" page: compliance level, inaccessible content, contact and means of redress.',
      fr: {
        title: "Déclaration d'accessibilité publiée",
        why: "Elle informe les usagers du niveau de conformité et leur donne un moyen de signaler un blocage.",
        fix: "Publiez une page « Accessibilité » : niveau de conformité, contenus non accessibles, contact et voie de recours.",
        source: "Directive (UE) 2016/2102 et European Accessibility Act",
      },
      applies: (ctx) => ctx.spec.project.type === "public-service" || ctx.spec.project.type === "ecommerce",
      check: (ctx) => evidence(tr(ctx, "Attach the link to the accessibility statement.", "Joignez le lien vers la déclaration d'accessibilité.")),
    }),

    defineRule({
      id: "a11y.axe",
      title: "Automated WCAG check on the pages browsed",
      why: "Contrast, form labels, button names, structure: part of the WCAG criteria can be checked automatically on every page.",
      layer: 3,
      category: "quality",
      severity: "major",
      method: "auto",
      source: { label: "axe-core, WCAG 2.2 A and AA rules", url: "https://dequeuniversity.com/rules/axe/" },
      fix: "Fix each listed problem using the linked axe-core page, then run the full audit again.",
      fr: {
        title: "Contrôle automatique WCAG sur les pages parcourues",
        why: "Contrastes, libellés de formulaires, noms de boutons, structure : une partie des critères WCAG se vérifie automatiquement sur chaque page.",
        fix: "Corrigez chaque problème listé en suivant la fiche axe-core liée, puis relancez l'audit complet.",
        source: "axe-core, règles WCAG 2.2 A et AA",
      },
      applies: (ctx) => ctx.spec.project.audience !== "internal",
      check: (ctx) =>
        withCrawl(ctx, (crawl) => {
          const audited = crawl.pages.filter((p) => p.axe);
          if (!audited.length) return warn(tr(ctx, "axe-core could not run on any page.", "axe-core n'a pu s'exécuter sur aucune page."));
          const byId = new Map<string, { v: AxeViolation; pages: string[]; nodes: number }>();
          for (const page of audited)
            for (const v of page.axe!.violations) {
              const e = byId.get(v.id) ?? { v, pages: [], nodes: 0 };
              e.pages.push(pathOf(page.url));
              e.nodes += v.nodes;
              byId.set(v.id, e);
            }
          if (!byId.size)
            return pass(
              tr(ctx, `No automated violations on ${plural(audited.length, "page")}.`, `Aucune violation automatique sur ${plural(audited.length, "page")}.`),
            );
          const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
          const sev = (i: AxeViolation["impact"]): Severity => (i === "critical" || i === "serious" ? "major" : i === "moderate" ? "minor" : "info");
          return [...byId.values()]
            .sort((a, b) => (rank[a.v.impact ?? "minor"] - rank[b.v.impact ?? "minor"]) || b.nodes - a.nodes)
            .slice(0, 30)
            .map(({ v, pages, nodes }): Finding => {
              const where = `${pages.slice(0, 3).join(", ")}${pages.length > 3 ? "…" : ""}`;
              return fail(
                tr(
                  ctx,
                  `${v.help}: ${plural(nodes, "element")} on ${plural(pages.length, "page")} (${where}).`,
                  `${v.help} : ${plural(nodes, "élément")} sur ${plural(pages.length, "page")} (${where}).`,
                ),
                {
                  severity: sev(v.impact),
                  observed: `${v.id} · ${v.impact ?? "?"} · ${v.helpUrl}`,
                },
              );
            });
        }),
    }),
  ],
});
