import {
  definePack,
  defineRule,
  evidence,
  fail,
  hasFeature,
  isCritical,
  na,
  pass,
  tr,
  warn,
  type Finding,
  notRun,
} from "@golive/packs-sdk";
import { list, pathOf, plural, withCrawl, withRepo, withWeb } from "./util";

const HEADERS = { label: "OWASP Secure Headers Project", url: "https://owasp.org/www-project-secure-headers/" };
const ASVS = { label: "OWASP ASVS 5.0", url: "https://owasp.org/www-project-application-security-verification-standard/" };

export const webSecurity = definePack({
  id: "web-security",
  name: "Web security",
  version: "0.1.0",
  description: "Checks from the OWASP Top 10 and OWASP ASVS level 1.",
  maintainer: "PcyBox GoLive",
  core: true,
  fr: { name: "Sécurité web", description: "Contrôles issus de l'OWASP Top 10 et de l'OWASP ASVS niveau 1." },
  rules: [
    defineRule({
      id: "sec.web.https",
      title: "HTTPS with a valid certificate",
      why: "Without valid HTTPS, browsers show a warning and everything users type travels in clear text.",
      layer: 3,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: ASVS,
      fix: "Install a trusted certificate (Let's Encrypt is enough) and serve the whole site over HTTPS.",
      fr: {
        title: "HTTPS avec un certificat valide",
        why: "Sans HTTPS valide, les navigateurs affichent une alerte et toute donnée saisie circule en clair.",
        fix: "Installez un certificat reconnu (Let's Encrypt suffit) et servez tout le site en HTTPS.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (!web.finalUrl.startsWith("https://")) return fail(tr(ctx, "The site is served over HTTP.", "Le site est servi en HTTP."), { observed: web.finalUrl });
          if (!web.tls) return warn(tr(ctx, "Could not read the certificate.", "Impossible de lire le certificat."));
          if (!web.tls.authorized)
            return fail(
              tr(ctx, `Certificate rejected: ${web.tls.authError ?? "invalid chain"}.`, `Certificat refusé : ${web.tls.authError ?? "chaîne invalide"}.`),
              { observed: web.tls.issuer },
            );
          return pass(
            tr(
              ctx,
              `Valid certificate, issued by ${web.tls.issuer ?? "a trusted authority"} (${web.tls.protocol ?? "TLS"}).`,
              `Certificat valide, émis par ${web.tls.issuer ?? "une autorité reconnue"} (${web.tls.protocol ?? "TLS"}).`,
            ),
          );
        }),
    }),

    defineRule({
      id: "sec.web.tls-expiry",
      title: "Certificate far from expiry",
      why: "An expired certificate takes the service down for every visitor overnight.",
      layer: 3,
      category: "operations",
      severity: "major",
      method: "auto",
      source: { label: "Let's Encrypt, automatic renewal", url: "https://letsencrypt.org/docs/integration-guide/" },
      fix: "Automate renewal (ACME) and monitor the expiry date.",
      fr: {
        title: "Certificat loin de son expiration",
        why: "Un certificat expiré coupe le service pour tous les visiteurs, du jour au lendemain.",
        fix: "Automatisez le renouvellement (ACME) et supervisez la date d'expiration.",
        source: "Let's Encrypt, renouvellement automatique",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (!web.tls) return warn(tr(ctx, "Certificate not read.", "Certificat non lu."));
          const d = web.tls.daysLeft;
          if (d < 7)
            return fail(tr(ctx, `The certificate expires in ${d} days.`, `Le certificat expire dans ${d} jours.`), { observed: web.tls.validTo, severity: "blocker" });
          if (d < 21) return warn(tr(ctx, `The certificate expires in ${d} days.`, `Le certificat expire dans ${d} jours.`), { observed: web.tls.validTo });
          return pass(tr(ctx, `Certificate valid for ${d} more days.`, `Certificat valide encore ${d} jours.`), { observed: web.tls.validTo });
        }),
    }),

    defineRule({
      id: "sec.web.http-redirect",
      title: "HTTP redirects to HTTPS",
      why: "Visitors who type the address without https:// must be switched to a secure connection automatically.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: ASVS,
      fix: "Add a permanent redirect (301 or 308) from http:// to https:// on the whole domain.",
      fr: {
        title: "HTTP redirige vers HTTPS",
        why: "Les visiteurs qui tapent l'adresse sans https:// doivent être basculés automatiquement en connexion sécurisée.",
        fix: "Ajoutez une redirection permanente (301 ou 308) de http:// vers https:// sur tout le domaine.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (web.httpsRedirect === null) return warn(tr(ctx, "HTTP redirect not tested.", "Redirection HTTP non testée."));
          if (web.httpsRedirect === "closed") return pass(tr(ctx, "Port 80 is closed: no clear-text access possible.", "Le port 80 est fermé : aucun accès en clair possible."));
          return web.httpsRedirect
            ? pass(tr(ctx, "http:// redirects to https://.", "http:// redirige vers https://."))
            : fail(tr(ctx, "http:// does not redirect to https://.", "http:// ne redirige pas vers https://."));
        }),
    }),

    defineRule({
      id: "sec.web.hsts",
      title: "HSTS enabled",
      why: "HSTS stops an attacker from forcing an unencrypted connection on the first request.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: HEADERS,
      fix: "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.",
      fr: {
        title: "HSTS activé",
        why: "HSTS empêche un attaquant de forcer une connexion non chiffrée lors de la première requête.",
        fix: "Envoyez Strict-Transport-Security: max-age=31536000; includeSubDomains.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const v = web.headers["strict-transport-security"];
          if (!v) return fail(tr(ctx, "No Strict-Transport-Security header.", "En-tête Strict-Transport-Security absent."));
          const age = Number(/max-age=(\d+)/i.exec(v)?.[1] ?? 0);
          if (age < 15_552_000)
            return warn(
              tr(ctx, `max-age too short (${age} s, recommended minimum 180 days).`, `max-age trop court (${age} s, minimum conseillé 180 jours).`),
              { observed: v },
            );
          return pass(tr(ctx, "HSTS active.", "HSTS actif."), { observed: v });
        }),
    }),

    defineRule({
      id: "sec.web.csp",
      title: "Content Security Policy (CSP)",
      why: "A CSP greatly limits the impact of script injection (XSS), the most common web flaw.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: "MDN, Content-Security-Policy", url: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy" },
      fix: "Define a strict CSP, ideally nonce-based, starting in Report-Only mode.",
      fr: {
        title: "Politique de sécurité du contenu (CSP)",
        why: "La CSP limite fortement l'impact d'une injection de script (XSS), la faille web la plus répandue.",
        fix: "Définissez une CSP stricte, idéalement à base de nonces, en commençant en mode Report-Only.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const v = web.headers["content-security-policy"];
          if (!v) {
            return web.headers["content-security-policy-report-only"]
              ? warn(tr(ctx, "CSP present in Report-Only mode only.", "CSP présente en mode Report-Only seulement."))
              : fail(tr(ctx, "No Content-Security-Policy header.", "En-tête Content-Security-Policy absent."));
          }
          const scriptSrc = /script-src([^;]*)/i.exec(v)?.[1] ?? /default-src([^;]*)/i.exec(v)?.[1] ?? "";
          if (/'unsafe-inline'/.test(scriptSrc) && !/'nonce-|'strict-dynamic'/.test(scriptSrc)) {
            return warn(tr(ctx, "The CSP allows inline scripts ('unsafe-inline').", "La CSP autorise les scripts inline ('unsafe-inline')."), { observed: truncate(v) });
          }
          return pass(tr(ctx, "CSP in place.", "CSP en place."), { observed: truncate(v) });
        }),
    }),

    defineRule({
      id: "sec.web.clickjacking",
      title: "Protection against malicious framing",
      why: "Without protection, your site can be shown in an invisible frame to hijack users' clicks.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: HEADERS,
      fix: "Send Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: DENY).",
      fr: {
        title: "Protection contre l'intégration malveillante",
        why: "Sans protection, votre site peut être affiché dans un cadre invisible pour piéger les clics des utilisateurs.",
        fix: "Envoyez Content-Security-Policy: frame-ancestors 'self' (ou X-Frame-Options: DENY).",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const csp = web.headers["content-security-policy"] ?? "";
          if (/frame-ancestors/i.test(csp)) return pass(tr(ctx, "frame-ancestors set in the CSP.", "frame-ancestors défini dans la CSP."));
          const xfo = web.headers["x-frame-options"];
          if (xfo && /deny|sameorigin/i.test(xfo)) return pass(`X-Frame-Options: ${xfo}.`);
          return fail(tr(ctx, "Neither frame-ancestors nor X-Frame-Options.", "Ni frame-ancestors ni X-Frame-Options."));
        }),
    }),

    defineRule({
      id: "sec.web.basic-headers",
      title: "Basic security headers",
      why: "A few simple headers close whole classes of attacks at no cost.",
      layer: 3,
      category: "security",
      severity: "minor",
      method: "auto",
      source: HEADERS,
      fix: "Add X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin and a Permissions-Policy.",
      fr: {
        title: "En-têtes de sécurité de base",
        why: "Quelques en-têtes simples ferment des classes d'attaques entières pour un coût nul.",
        fix: "Ajoutez X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin et une Permissions-Policy.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const h = web.headers;
          return [
            /nosniff/i.test(h["x-content-type-options"] ?? "")
              ? pass("X-Content-Type-Options: nosniff.")
              : fail(tr(ctx, "No X-Content-Type-Options.", "X-Content-Type-Options absent.")),
            h["referrer-policy"] ? pass(`Referrer-Policy: ${h["referrer-policy"]}.`) : warn(tr(ctx, "No Referrer-Policy.", "Referrer-Policy absent.")),
            h["permissions-policy"]
              ? pass(tr(ctx, "Permissions-Policy present.", "Permissions-Policy présent."))
              : warn(tr(ctx, "No Permissions-Policy.", "Permissions-Policy absent."), { severity: "info" }),
          ];
        }),
    }),

    defineRule({
      id: "sec.web.cookies",
      title: "Protected cookies",
      why: "A session cookie without Secure or HttpOnly can be intercepted or stolen by a script.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: "OWASP Session Management Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html" },
      fix: "Set the Secure, HttpOnly and SameSite=Lax (or Strict) attributes on session cookies.",
      fr: {
        title: "Cookies protégés",
        why: "Un cookie de session sans Secure ou HttpOnly peut être intercepté ou volé par un script.",
        fix: "Posez les attributs Secure, HttpOnly et SameSite=Lax (ou Strict) sur les cookies de session.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (web.setCookies.length === 0) return pass(tr(ctx, "No cookie set on the home page.", "Aucun cookie posé sur la page d'accueil."));
          const out: Finding[] = [];
          for (const c of web.setCookies) {
            const session = /sess|sid|auth|token|jwt|login|csrf/i.test(c.name);
            const issues = [!c.secure && "Secure", session && !c.httpOnly && "HttpOnly", !c.sameSite && "SameSite"].filter(Boolean) as string[];
            out.push(
              issues.length
                ? (issues.includes("Secure") || issues.includes("HttpOnly") ? fail : warn)(
                    tr(ctx, `Cookie ${c.name} without ${list(issues)}.`, `Cookie ${c.name} sans ${list(issues)}.`),
                    { observed: c.name },
                  )
                : pass(tr(ctx, `Cookie ${c.name} properly protected.`, `Cookie ${c.name} correctement protégé.`)),
            );
          }
          return out;
        }),
    }),

    defineRule({
      id: "sec.web.disclosure",
      title: "No software version disclosed",
      why: "Announcing the exact server or CMS version helps an attacker pick the right exploit.",
      layer: 3,
      category: "security",
      severity: "minor",
      method: "auto",
      source: { label: "OWASP WSTG, Fingerprint Web Server", url: "https://owasp.org/www-project-web-security-testing-guide/" },
      fix: "Hide the Server and X-Powered-By headers and remove the generator meta tag.",
      fr: {
        title: "Pas de version logicielle divulguée",
        why: "Annoncer la version exacte du serveur ou du CMS aide un attaquant à choisir la bonne faille.",
        fix: "Masquez les en-têtes Server et X-Powered-By et retirez la balise meta generator.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          const leaks = [
            ["Server", web.headers["server"]],
            ["X-Powered-By", web.headers["x-powered-by"]],
            ["generator", web.html?.generator],
          ].filter(([, v]) => v && /\d+\.\d+/.test(v)) as [string, string][];
          return leaks.length
            ? leaks.map(([k, v]) => warn(tr(ctx, `${k} discloses "${v}".`, `${k} divulgue « ${v} ».`), { observed: v }))
            : pass(tr(ctx, "No version disclosed.", "Aucune version divulguée."));
        }),
    }),

    defineRule({
      id: "sec.web.mixed-content",
      title: "No mixed content",
      why: "A resource loaded over http:// on an https:// page can be altered in transit and breaks the browser padlock.",
      layer: 3,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: "W3C, Mixed Content", url: "https://www.w3.org/TR/mixed-content/" },
      fix: "Load every resource over https:// (or with a relative path) and add the CSP directive upgrade-insecure-requests.",
      fr: {
        title: "Aucun contenu mixte",
        why: "Une ressource chargée en http:// sur une page https:// peut être modifiée en chemin et casse le cadenas du navigateur.",
        fix: "Chargez toutes les ressources en https:// (ou en chemin relatif) et ajoutez la directive CSP upgrade-insecure-requests.",
      },
      check: (ctx) =>
        withCrawl(ctx, (crawl) => {
          if (!crawl.mixedContent.length)
            return pass(tr(ctx, `No http:// resource on ${plural(crawl.pages.length, "page")}.`, `Aucune ressource http:// sur ${plural(crawl.pages.length, "page")}.`));
          const pages = new Set(crawl.mixedContent.map((m) => m.page));
          const first = crawl.mixedContent[0]!;
          const n = crawl.mixedContent.length;
          return fail(
            tr(
              ctx,
              `${plural(n, "resource")} over http:// on ${plural(pages.size, "page")}, for example ${first.url} (${pathOf(first.page)}).`,
              `${plural(n, "ressource")} en http:// sur ${plural(pages.size, "page")}, par exemple ${first.url} (${pathOf(first.page)}).`,
            ),
            { observed: crawl.mixedContent.slice(0, 3).map((m) => m.url).join(" ") },
          );
        }),
    }),

    defineRule({
      id: "sec.web.exposed-files",
      title: "No sensitive file publicly readable",
      why: "A readable .git folder, .env file or database dump hands over source code, passwords and personal data to anyone who asks.",
      layer: 3,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: { label: "OWASP Web Security Testing Guide, WSTG-CONF-04", url: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information" },
      fix: "Remove these files from the published folder, block hidden files and backups in the web server configuration, then rotate every secret they contained.",
      fr: {
        title: "Aucun fichier sensible lisible publiquement",
        why: "Un dossier .git, un fichier .env ou un export de base lisible livre le code source, les mots de passe et des données personnelles à quiconque le demande.",
        fix: "Retirez ces fichiers du dossier publié, bloquez les fichiers cachés et les sauvegardes dans la configuration du serveur web, puis changez tous les secrets qu'ils contenaient.",
        source: "OWASP Web Security Testing Guide, WSTG-CONF-04",
      },
      check: (ctx) =>
        withWeb(ctx, (web) => {
          if (!web.exposedFiles) return notRun(tr(ctx, "This audit did not look for exposed files. Run a new audit.", "Cet audit n'a pas recherché les fichiers exposés. Relancez un audit."));
          if (!web.exposedFiles.length) return pass(tr(ctx, "None of the usual sensitive files (.git, .env, SQL dumps, backups) is readable.", "Aucun des fichiers sensibles habituels (.git, .env, exports SQL, sauvegardes) n'est lisible."));
          const what: Record<string, [string, string]> = {
            git: ["Git repository: source code and history", "Dépôt Git : code source et historique"],
            vcs: ["version control folder", "dossier de gestion de versions"],
            env: ["environment file: secrets and passwords", "fichier d'environnement : secrets et mots de passe"],
            dump: ["database dump", "export de base de données"],
            credentials: ["password file", "fichier de mots de passe"],
            config: ["configuration backup with credentials", "sauvegarde de configuration avec identifiants"],
            debug: ["server diagnostics page", "page de diagnostic du serveur"],
            listing: ["folder listing file", "fichier d'index de dossier"],
          };
          return web.exposedFiles.map((f) =>
            fail(tr(ctx, `${f.path} is publicly readable (${what[f.kind]![0]}).`, `${f.path} est lisible publiquement (${what[f.kind]![1]}).`), {
              observed: `${f.status} ${f.path}`,
              severity: f.kind === "debug" ? "major" : f.kind === "listing" ? "minor" : "blocker",
            }),
          );
        }),
    }),

    defineRule({
      id: "sec.web.password-over-http",
      title: "No password typed in clear text",
      why: "A password form on an HTTP page sends credentials in clear text over the network.",
      layer: 3,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: ASVS,
      fix: "Serve every sign-in page over HTTPS and point forms to HTTPS URLs.",
      fr: {
        title: "Aucun mot de passe saisi en clair",
        why: "Un formulaire de mot de passe sur une page HTTP envoie les identifiants en clair sur le réseau.",
        fix: "Servez toutes les pages de connexion en HTTPS et faites pointer les formulaires vers des URL HTTPS.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) =>
          (web.html?.passwordFieldsOverHttp ?? 0) > 0
            ? fail(tr(ctx, "A password field is served or submitted over HTTP.", "Un champ mot de passe est servi ou envoyé en HTTP."))
            : pass(tr(ctx, "No password field exposed in clear text.", "Aucun champ mot de passe exposé en clair.")),
        ),
    }),

    defineRule({
      id: "sec.web.security-txt",
      title: "Security contact published (security.txt)",
      why: "A researcher who finds a flaw must know whom to report it to, rather than publishing it.",
      layer: 3,
      category: "security",
      severity: "info",
      method: "auto",
      source: { label: "RFC 9116, security.txt", url: "https://www.rfc-editor.org/rfc/rfc9116" },
      fix: "Publish /.well-known/security.txt with a contact and an expiry date.",
      fr: {
        title: "Contact sécurité publié (security.txt)",
        why: "Un chercheur qui trouve une faille doit savoir à qui la signaler, plutôt que de la publier.",
        fix: "Publiez /.well-known/security.txt avec un contact et une date d'expiration.",
      },
      check: (ctx) =>
        withWeb(ctx, (web) =>
          web.wellKnown.securityTxt
            ? pass(tr(ctx, "security.txt published.", "security.txt publié."))
            : warn(tr(ctx, "No security.txt.", "security.txt absent.")),
        ),
    }),

    /* -------------------------------------------------- declared features */

    defineRule({
      id: "sec.app.admin-mfa",
      title: "Two-factor authentication for administrators",
      why: "An administrator account protected by a single password is the most targeted way in.",
      layer: 1,
      category: "security",
      severity: (ctx) => (isCritical(ctx) ? "blocker" : "major"),
      method: "evidence",
      source: ASVS,
      fix: "Make two-factor authentication (TOTP, security key, passkey) mandatory for every privileged account.",
      fr: {
        title: "Double authentification pour les administrateurs",
        why: "Un compte administrateur protégé par un seul mot de passe est la porte d'entrée la plus visée.",
        fix: "Activez une double authentification (TOTP, clé de sécurité, passkey) obligatoire pour tous les comptes à privilèges.",
      },
      applies: (ctx) => hasFeature(ctx, "admin") || ctx.spec.actors.some((a) => a.kind === "admin"),
      check: (ctx) =>
        evidence(tr(ctx, "Attest that two-factor authentication is mandatory for administrators.", "Attestez que la double authentification est obligatoire pour les administrateurs.")),
    }),

    defineRule({
      id: "sec.app.passwords",
      title: "Password policy and brute-force protection",
      why: "Weak passwords and unlimited attempts let accounts be guessed within hours.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "evidence",
      source: { label: "NIST SP 800-63B", url: "https://pages.nist.gov/800-63-4/sp800-63b.html" },
      fix: "Require at least 12 characters, reject breached passwords, limit attempts and hash with Argon2id or bcrypt.",
      fr: {
        title: "Politique de mots de passe et anti force brute",
        why: "Des mots de passe faibles et des tentatives illimitées permettent de deviner les comptes en quelques heures.",
        fix: "Imposez 12 caractères minimum, refusez les mots de passe compromis, limitez les tentatives et hachez avec Argon2id ou bcrypt.",
      },
      applies: (ctx) => hasFeature(ctx, "accounts"),
      check: (ctx) =>
        evidence(tr(ctx, "Attest the password policy, hashing and attempt limiting.", "Attestez la politique de mots de passe, le hachage et la limitation des tentatives.")),
    }),

    defineRule({
      id: "sec.app.uploads",
      title: "Uploaded files checked",
      why: "An unfiltered upload lets someone drop an executable script or a booby-trapped file.",
      layer: 1,
      category: "security",
      severity: "major",
      method: "evidence",
      source: { label: "OWASP File Upload Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html" },
      fix: "Check type and size on the server, rename files, store them outside the web root and scan them (antivirus).",
      fr: {
        title: "Fichiers téléversés contrôlés",
        why: "Un téléversement non filtré permet de déposer un script exécutable ou un fichier piégé.",
        fix: "Vérifiez type et taille côté serveur, renommez les fichiers, stockez-les hors de la racine web et analysez-les (antivirus).",
      },
      applies: (ctx) => hasFeature(ctx, "uploads"),
      check: (ctx) =>
        ctx.graph.has("storage")
          ? evidence(tr(ctx, "Attest file type and size checks and antivirus scanning.", "Attestez le contrôle des types, tailles et l'analyse antivirus des fichiers."))
          : fail(
              tr(
                ctx,
                "Uploads declared but no object storage: files end up on the application server.",
                "Téléversement déclaré, mais aucun stockage objet : les fichiers finissent sur le serveur applicatif.",
              ),
              { severity: "major" },
            ),
    }),

    defineRule({
      id: "sec.app.forms-abuse",
      title: "Forms protected against abuse",
      why: "An unprotected public form is quickly used for spam or mass e-mailing.",
      layer: 1,
      category: "security",
      severity: "minor",
      method: "evidence",
      source: { label: "OWASP Automated Threats", url: "https://owasp.org/www-project-automated-threats-to-web-applications/" },
      fix: "Add rate limiting and a privacy-friendly bot challenge (for example Friendly Captcha, Turnstile, ALTCHA).",
      fr: {
        title: "Formulaires protégés contre les abus",
        why: "Un formulaire public sans protection est vite utilisé pour du spam ou de l'envoi massif d'e-mails.",
        fix: "Ajoutez une limitation de débit et un défi anti-robot respectueux de la vie privée (ex. Friendly Captcha, Turnstile, ALTCHA).",
      },
      applies: (ctx) => hasFeature(ctx, "forms", "newsletter"),
      check: (ctx) =>
        evidence(tr(ctx, "Attest rate limiting and bot protection on forms.", "Attestez la limitation de débit et la protection anti-robot des formulaires.")),
    }),

    /* ------------------------------------------------------- layer 2 */

    defineRule({
      id: "sec.code.secrets",
      title: "No secrets in the code",
      why: "A committed key ends up sooner or later in a backup, a fork or a public repository: treat it as compromised.",
      layer: 2,
      category: "security",
      severity: "blocker",
      method: "auto",
      source: { label: "OWASP Secrets Management Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html" },
      fix: "Revoke the key, remove it from the git history, then load it from a vault or untracked environment variables.",
      fr: {
        title: "Aucun secret dans le code",
        why: "Une clé versionnée finit tôt ou tard dans une sauvegarde, un fork ou un dépôt public : elle doit être considérée comme compromise.",
        fix: "Révoquez la clé, retirez-la de l'historique git, puis chargez-la depuis un coffre ou des variables d'environnement non versionnées.",
      },
      check: (ctx) =>
        withRepo(ctx, (repo) =>
          repo.secrets.length
            ? repo.secrets.map((f) => fail(tr(ctx, `${f.description} in ${f.file}:${f.line}.`, `${f.description} dans ${f.file}:${f.line}.`), { observed: f.rule }))
            : pass(tr(ctx, `No secret found in ${repo.files} files.`, `Aucun secret détecté dans ${repo.files} fichiers.`)),
        ),
    }),

    defineRule({
      id: "sec.app.dependency-scan",
      title: "Dependencies without known vulnerabilities",
      why: "Most of an application's code comes from dependencies; a known flaw in them is exploited within days.",
      layer: 2,
      category: "security",
      severity: "major",
      method: "hybrid",
      source: { label: "OWASP Top 10 A06: Vulnerable and Outdated Components", url: "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/" },
      fix: "Update the affected packages to the fixed version, then keep golive check --repo in CI.",
      fr: {
        title: "Dépendances sans vulnérabilité connue",
        why: "La majorité du code d'une application vient de dépendances ; une faille connue y est exploitée en quelques jours.",
        fix: "Mettez à jour les paquets concernés vers la version corrigée, puis gardez golive check --repo dans la CI.",
      },
      applies: (ctx) => ctx.graph.has("frontend", "backend", "api", "mobile") || !!ctx.repo?.dependencies.manifests.length,
      check: (ctx) => {
        const repo = ctx.repo;
        if (!repo)
          return evidence(
            tr(
              ctx,
              "Run golive check --repo . in CI, or attest that another dependency scanner runs there.",
              "Lancez golive check --repo . dans la CI, ou attestez qu'un autre scanner de dépendances y tourne.",
            ),
          );
        const deps = repo.dependencies;
        if (!deps.checked)
          return evidence(
            tr(
              ctx,
              `${deps.error ?? "Vulnerabilities not checked."} Attest another scanner or run again online.`,
              `${deps.error ?? "Vulnérabilités non vérifiées."} Attestez un autre scanner ou relancez en ligne.`,
            ),
          );
        if (!deps.manifests.some((m) => m.packages > 0)) return na(tr(ctx, "No lockfile found in the repository.", "Aucun lockfile trouvé dans le dépôt."));
        if (!deps.vulnerabilities.length) {
          const n = deps.manifests.reduce((a, m) => a + m.packages, 0);
          return pass(tr(ctx, `No known vulnerability among ${n} packages.`, `Aucune vulnérabilité connue parmi ${n} paquets.`));
        }
        const SEV = { critical: "blocker", high: "major", medium: "minor", low: "info", unknown: "minor" } as const;
        const shown = deps.vulnerabilities.slice(0, 40).map((v) => {
          const ref = v.aliases.find((a) => a.startsWith("CVE-")) ?? v.id;
          const summary = v.summary ? `, ${v.summary}` : "";
          return (v.severity === "critical" || v.severity === "high" ? fail : warn)(
            tr(
              ctx,
              `${v.package} ${v.version}: ${ref}${summary}${v.fixed ? ` (fixed in ${v.fixed})` : ""}.`,
              `${v.package} ${v.version} : ${ref}${summary}${v.fixed ? ` (corrigé en ${v.fixed})` : ""}.`,
            ),
            { observed: v.id, severity: SEV[v.severity] },
          );
        });
        const rest = deps.vulnerabilities.length - shown.length;
        return rest > 0
          ? [...shown, warn(tr(ctx, `${rest} more vulnerabilities, see the JSON report.`, `${rest} autres vulnérabilités, voir le rapport JSON.`), { severity: "info" })]
          : shown;
      },
    }),

    defineRule({
      id: "sec.code.containers",
      title: "Hardened container images",
      why: "A container running as root or shipping a secret turns the smallest application flaw into a host compromise.",
      layer: 2,
      category: "security",
      severity: "major",
      method: "auto",
      source: { label: "CIS Docker Benchmark; OWASP Docker Security Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html" },
      fix: "Add a dedicated user (USER), pin base images to a version, pass secrets at runtime and never in the image.",
      fr: {
        title: "Images de conteneur durcies",
        why: "Un conteneur qui tourne en root ou embarque un secret transforme la moindre faille applicative en compromission de l'hôte.",
        fix: "Ajoutez un utilisateur dédié (USER), épinglez les images de base par version, passez les secrets au démarrage et jamais dans l'image.",
        source: "CIS Docker Benchmark ; OWASP Docker Security Cheat Sheet",
      },
      check: (ctx) =>
        withRepo(ctx, (repo) => {
          const SEV = { "secret-in-image": "blocker", "root-user": "major", privileged: "major", "unpinned-image": "minor" } as const;
          const issues = repo.containers.filter((c) => c.check !== "published-datastore");
          if (!issues.length) {
            const n = repo.containerFiles.length;
            return n
              ? pass(tr(ctx, `${plural(n, "container file")} without issues.`, `${n} fichier${n > 1 ? "s" : ""} de conteneur sans problème.`))
              : na(tr(ctx, "No Dockerfile or compose file.", "Aucun Dockerfile ni fichier compose."));
          }
          return issues.map((c) =>
            (c.check === "unpinned-image" ? warn : fail)(`${c.message} (${c.file}${c.line ? `:${c.line}` : ""})`, {
              observed: c.check,
              severity: SEV[c.check as keyof typeof SEV],
            }),
          );
        }),
    }),

    defineRule({
      id: "sec.ai.data-minimised",
      title: "Data sent to AI minimized",
      why: "Data sent to a third-party AI service leaves your perimeter and may be retained.",
      layer: 1,
      category: "data",
      severity: "major",
      method: "evidence",
      source: { label: "OWASP Top 10 for LLM Applications, LLM02", url: "https://genai.owasp.org/llm-top-10/" },
      fix: "Mask identifiers and personal data before the call, and check that the provider does not train its models on your data.",
      fr: {
        title: "Données envoyées à l'IA minimisées",
        why: "Les données transmises à un service d'IA tiers quittent votre périmètre et peuvent être conservées.",
        fix: "Masquez identifiants et données personnelles avant l'appel, vérifiez que le fournisseur n'entraîne pas ses modèles sur vos données.",
      },
      applies: (ctx) => ctx.graph.has("ai") || hasFeature(ctx, "ai"),
      check: (ctx) => {
        const ais = ctx.graph.ofKind("ai");
        const exposed = ais.filter((a) => ctx.graph.linksTo(a.id).some((l) => l.sensitivity === "personal" || l.sensitivity === "sensitive"));
        return exposed.length
          ? exposed.map((a) =>
              evidence(
                tr(
                  ctx,
                  `${ctx.graph.label(a.id)} receives personal data: attest the minimization.`,
                  `${ctx.graph.label(a.id)} reçoit des données personnelles : attestez la minimisation.`,
                ),
                { target: a.id },
              ),
            )
          : evidence(
              tr(
                ctx,
                "Attest that no personal data is sent to the AI service, or that it is masked.",
                "Attestez qu'aucune donnée personnelle n'est envoyée au service d'IA, ou qu'elle est masquée.",
              ),
            );
      },
    }),
  ],
});

function truncate(s: string, n = 120) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
