import {
  definePack,
  defineRule,
  evidence,
  fail,
  hasFeature,
  isCritical,
  pass,
  warn,
  type Finding,
} from "@golive/packs-sdk";
import { list, withWeb } from "./util";

const HEADERS = { label: "OWASP Secure Headers Project", url: "https://owasp.org/www-project-secure-headers/" };
const ASVS = { label: "OWASP ASVS 5.0", url: "https://owasp.org/www-project-application-security-verification-standard/" };

export const webSecurity = definePack({
  id: "web-security",
  name: "Sécurité web",
  version: "0.1.0",
  description: "Contrôles issus de l'OWASP Top 10 et de l'OWASP ASVS niveau 1.",
  maintainer: "PcyBox GoLive",
  core: true,
  rules: [
    defineRule({
      id: "sec.web.https",
      title: "HTTPS avec un certificat valide",
      why: "Sans HTTPS valide, les navigateurs affichent une alerte et toute donnée saisie circule en clair.",
      layer: 3,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: ASVS,
      fix: "Installez un certificat reconnu (Let's Encrypt suffit) et servez tout le site en HTTPS.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (!web.finalUrl.startsWith("https://")) return fail("Le site est servi en HTTP.", { observed: web.finalUrl });
          if (!web.tls) return warn("Impossible de lire le certificat.");
          if (!web.tls.authorized) return fail(`Certificat refusé : ${web.tls.authError ?? "chaîne invalide"}.`, { observed: web.tls.issuer });
          return pass(`Certificat valide, émis par ${web.tls.issuer ?? "une autorité reconnue"} (${web.tls.protocol ?? "TLS"}).`);
        }),
    }),

    defineRule({
      id: "sec.web.tls-expiry",
      title: "Certificat loin de son expiration",
      why: "Un certificat expiré coupe le service pour tous les visiteurs, du jour au lendemain.",
      layer: 3,
      category: "operations",
      severity: "major",
      method: "auto",
      source: { label: "Let's Encrypt, renouvellement automatique", url: "https://letsencrypt.org/docs/integration-guide/" },
      fix: "Automatisez le renouvellement (ACME) et supervisez la date d'expiration.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (!web.tls) return warn("Certificat non lu.");
          const d = web.tls.daysLeft;
          if (d < 7) return fail(`Le certificat expire dans ${d} jours.`, { observed: web.tls.validTo, severity: "blocker" });
          if (d < 21) return warn(`Le certificat expire dans ${d} jours.`, { observed: web.tls.validTo });
          return pass(`Certificat valide encore ${d} jours.`, { observed: web.tls.validTo });
        }),
    }),

    defineRule({
      id: "sec.web.http-redirect",
      title: "HTTP redirige vers HTTPS",
      why: "Les visiteurs qui tapent l'adresse sans https:// doivent être basculés automatiquement en connexion sécurisée.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: ASVS,
      fix: "Ajoutez une redirection permanente (301 ou 308) de http:// vers https:// sur tout le domaine.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (web.httpsRedirect === null) return warn("Redirection HTTP non testée.");
          if (web.httpsRedirect === "closed") return pass("Le port 80 est fermé : aucun accès en clair possible.");
          return web.httpsRedirect ? pass("http:// redirige vers https://.") : fail("http:// ne redirige pas vers https://.");
        }),
    }),

    defineRule({
      id: "sec.web.hsts",
      title: "HSTS activé",
      why: "HSTS empêche un attaquant de forcer une connexion non chiffrée lors de la première requête.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: HEADERS,
      fix: "Envoyez Strict-Transport-Security: max-age=31536000; includeSubDomains.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const v = web.headers["strict-transport-security"];
          if (!v) return fail("En-tête Strict-Transport-Security absent.");
          const age = Number(/max-age=(\d+)/i.exec(v)?.[1] ?? 0);
          if (age < 15_552_000) return warn(`max-age trop court (${age} s, minimum conseillé 180 jours).`, { observed: v });
          return pass("HSTS actif.", { observed: v });
        }),
    }),

    defineRule({
      id: "sec.web.csp",
      title: "Politique de sécurité du contenu (CSP)",
      why: "La CSP limite fortement l'impact d'une injection de script (XSS), la faille web la plus répandue.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: "MDN, Content-Security-Policy", url: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy" },
      fix: "Définissez une CSP stricte, idéalement à base de nonces, en commençant en mode Report-Only.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const v = web.headers["content-security-policy"];
          if (!v) {
            return web.headers["content-security-policy-report-only"]
              ? warn("CSP présente en mode Report-Only seulement.")
              : fail("En-tête Content-Security-Policy absent.");
          }
          const scriptSrc = /script-src([^;]*)/i.exec(v)?.[1] ?? /default-src([^;]*)/i.exec(v)?.[1] ?? "";
          if (/'unsafe-inline'/.test(scriptSrc) && !/'nonce-|'strict-dynamic'/.test(scriptSrc)) {
            return warn("La CSP autorise les scripts inline ('unsafe-inline').", { observed: truncate(v) });
          }
          return pass("CSP en place.", { observed: truncate(v) });
        }),
    }),

    defineRule({
      id: "sec.web.clickjacking",
      title: "Protection contre l'intégration malveillante",
      why: "Sans protection, votre site peut être affiché dans un cadre invisible pour piéger les clics des utilisateurs.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: HEADERS,
      fix: "Envoyez Content-Security-Policy: frame-ancestors 'self' (ou X-Frame-Options: DENY).",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const csp = web.headers["content-security-policy"] ?? "";
          if (/frame-ancestors/i.test(csp)) return pass("frame-ancestors défini dans la CSP.");
          const xfo = web.headers["x-frame-options"];
          if (xfo && /deny|sameorigin/i.test(xfo)) return pass(`X-Frame-Options: ${xfo}.`);
          return fail("Ni frame-ancestors ni X-Frame-Options.");
        }),
    }),

    defineRule({
      id: "sec.web.basic-headers",
      title: "En-têtes de sécurité de base",
      why: "Quelques en-têtes simples ferment des classes d'attaques entières pour un coût nul.",
      layer: 3,
      category: "security",
      severity: "minor",
      method: "auto",
      source: HEADERS,
      fix: "Ajoutez X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin et une Permissions-Policy.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const h = web.headers;
          return [
            /nosniff/i.test(h["x-content-type-options"] ?? "") ? pass("X-Content-Type-Options: nosniff.") : fail("X-Content-Type-Options absent."),
            h["referrer-policy"] ? pass(`Referrer-Policy: ${h["referrer-policy"]}.`) : warn("Referrer-Policy absent."),
            h["permissions-policy"] ? pass("Permissions-Policy présent.") : warn("Permissions-Policy absent.", { severity: "info" }),
          ];
        }),
    }),

    defineRule({
      id: "sec.web.cookies",
      title: "Cookies protégés",
      why: "Un cookie de session sans Secure ou HttpOnly peut être intercepté ou volé par un script.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: "OWASP Session Management Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html" },
      fix: "Posez les attributs Secure, HttpOnly et SameSite=Lax (ou Strict) sur les cookies de session.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (web.setCookies.length === 0) return pass("Aucun cookie posé sur la page d'accueil.");
          const out: Finding[] = [];
          for (const c of web.setCookies) {
            const session = /sess|sid|auth|token|jwt|login|csrf/i.test(c.name);
            const issues = [!c.secure && "Secure", session && !c.httpOnly && "HttpOnly", !c.sameSite && "SameSite"].filter(Boolean) as string[];
            out.push(
              issues.length
                ? (issues.includes("Secure") || issues.includes("HttpOnly") ? fail : warn)(`Cookie ${c.name} sans ${list(issues)}.`, { observed: c.name })
                : pass(`Cookie ${c.name} correctement protégé.`),
            );
          }
          return out;
        }),
    }),

    defineRule({
      id: "sec.web.disclosure",
      title: "Pas de version logicielle divulguée",
      why: "Annoncer la version exacte du serveur ou du CMS aide un attaquant à choisir la bonne faille.",
      layer: 3,
      category: "security",
      severity: "minor",
      method: "auto",
      source: { label: "OWASP WSTG, Fingerprint Web Server", url: "https://owasp.org/www-project-web-security-testing-guide/" },
      fix: "Masquez les en-têtes Server et X-Powered-By et retirez la balise meta generator.",
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const leaks = [
            ["Server", web.headers["server"]],
            ["X-Powered-By", web.headers["x-powered-by"]],
            ["generator", web.html?.generator],
          ].filter(([, v]) => v && /\d+\.\d+/.test(v)) as [string, string][];
          return leaks.length
            ? leaks.map(([k, v]) => warn(`${k} divulgue « ${v} ».`, { observed: v }))
            : pass("Aucune version divulguée.");
        }),
    }),

    defineRule({
      id: "sec.web.password-over-http",
      title: "Aucun mot de passe saisi en clair",
      why: "Un formulaire de mot de passe sur une page HTTP envoie les identifiants en clair sur le réseau.",
      layer: 3,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: ASVS,
      fix: "Servez toutes les pages de connexion en HTTPS et faites pointer les formulaires vers des URL HTTPS.",
      check: (ctx) =>
        withWeb(ctx, (web) =>
          (web.html?.passwordFieldsOverHttp ?? 0) > 0
            ? fail("Un champ mot de passe est servi ou envoyé en HTTP.")
            : pass("Aucun champ mot de passe exposé en clair."),
        ),
    }),

    defineRule({
      id: "sec.web.security-txt",
      title: "Contact sécurité publié (security.txt)",
      why: "Un chercheur qui trouve une faille doit savoir à qui la signaler, plutôt que de la publier.",
      layer: 3,
      category: "security",
      severity: "info",
      method: "auto",
      source: { label: "RFC 9116, security.txt", url: "https://www.rfc-editor.org/rfc/rfc9116" },
      fix: "Publiez /.well-known/security.txt avec un contact et une date d'expiration.",
      check: (ctx) =>
        withWeb(ctx, (web) =>
          web.wellKnown.securityTxt ? pass("security.txt publié.") : warn("security.txt absent."),
        ),
    }),

    /* -------------------------------------------------- declared features */

    defineRule({
      id: "sec.app.admin-mfa",
      title: "Double authentification pour les administrateurs",
      why: "Un compte administrateur protégé par un seul mot de passe est la porte d'entrée la plus visée.",
      layer: 1,
      category: "security",
      severity: (ctx) => (isCritical(ctx) ? "blocker" : "major"),
      method: "evidence",
      source: ASVS,
      fix: "Activez une double authentification (TOTP, clé de sécurité, passkey) obligatoire pour tous les comptes à privilèges.",
      applies: (ctx) => hasFeature(ctx, "admin") || ctx.spec.actors.some((a) => a.kind === "admin"),
      check: () => evidence("Attestez que la double authentification est obligatoire pour les administrateurs."),
    }),

    defineRule({
      id: "sec.app.passwords",
      title: "Politique de mots de passe et anti force brute",
      why: "Des mots de passe faibles et des tentatives illimitées permettent de deviner les comptes en quelques heures.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "evidence",
      source: { label: "NIST SP 800-63B", url: "https://pages.nist.gov/800-63-4/sp800-63b.html" },
      fix: "Imposez 12 caractères minimum, refusez les mots de passe compromis, limitez les tentatives et hachez avec Argon2id ou bcrypt.",
      applies: (ctx) => hasFeature(ctx, "accounts"),
      check: () => evidence("Attestez la politique de mots de passe, le hachage et la limitation des tentatives."),
    }),

    defineRule({
      id: "sec.app.uploads",
      title: "Fichiers téléversés contrôlés",
      why: "Un téléversement non filtré permet de déposer un script exécutable ou un fichier piégé.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "evidence",
      source: { label: "OWASP File Upload Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html" },
      fix: "Vérifiez type et taille côté serveur, renommez les fichiers, stockez-les hors de la racine web et analysez-les (antivirus).",
      applies: (ctx) => hasFeature(ctx, "uploads"),
      check: (ctx) =>
        ctx.graph.has("storage")
          ? evidence("Attestez le contrôle des types, tailles et l'analyse antivirus des fichiers.")
          : fail("Téléversement déclaré, mais aucun stockage objet : les fichiers finissent sur le serveur applicatif.", { severity: "major" }),
    }),

    defineRule({
      id: "sec.app.forms-abuse",
      title: "Formulaires protégés contre les abus",
      why: "Un formulaire public sans protection est vite utilisé pour du spam ou de l'envoi massif d'e-mails.",
      layer: 1,
      category: "security",
      severity: "minor",
      method: "evidence",
      source: { label: "OWASP Automated Threats", url: "https://owasp.org/www-project-automated-threats-to-web-applications/" },
      fix: "Ajoutez une limitation de débit et un défi anti-robot respectueux de la vie privée (ex. Friendly Captcha, Turnstile, ALTCHA).",
      applies: (ctx) => hasFeature(ctx, "forms", "newsletter"),
      check: () => evidence("Attestez la limitation de débit et la protection anti-robot des formulaires."),
    }),

    defineRule({
      id: "sec.app.dependency-scan",
      title: "Dépendances analysées en continu",
      why: "La majorité du code d'une application vient de dépendances ; une faille connue y est exploitée en quelques jours.",
      layer: 2,
      category: "security",
      severity: "major",
      method: "evidence",
      source: { label: "OWASP Top 10 A06: Vulnerable and Outdated Components", url: "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/" },
      fix: "Ajoutez OSV-Scanner ou Trivy à la CI et bloquez les vulnérabilités critiques.",
      applies: (ctx) => ctx.graph.has("frontend", "backend", "api", "mobile"),
      check: () => evidence("Attestez qu'un scanner de dépendances tourne dans la CI (OSV-Scanner, Trivy, Dependabot…)."),
    }),

    defineRule({
      id: "sec.ai.data-minimised",
      title: "Données envoyées à l'IA minimisées",
      why: "Les données transmises à un service d'IA tiers quittent votre périmètre et peuvent être conservées.",
      layer: 1,
      category: "data",
      severity: "major",
      method: "evidence",
      source: { label: "OWASP Top 10 for LLM Applications, LLM02", url: "https://genai.owasp.org/llm-top-10/" },
      fix: "Masquez identifiants et données personnelles avant l'appel, vérifiez que le fournisseur n'entraîne pas ses modèles sur vos données.",
      applies: (ctx) => ctx.graph.has("ai") || hasFeature(ctx, "ai"),
      check: (ctx) => {
        const ais = ctx.graph.ofKind("ai");
        const exposed = ais.filter((a) =>
          ctx.graph.linksTo(a.id).some((l) => l.sensitivity === "personal" || l.sensitivity === "sensitive"),
        );
        return exposed.length
          ? exposed.map((a) => evidence(`${ctx.graph.label(a.id)} reçoit des données personnelles : attestez la minimisation.`, { target: a.id }))
          : evidence("Attestez qu'aucune donnée personnelle n'est envoyée au service d'IA, ou qu'elle est masquée.");
      },
    }),
  ],
});

function truncate(s: string, n = 120) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
