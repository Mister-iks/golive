import type { ActorKind, ComponentKind } from "./schema";

export interface KindInfo {
  label: string;
  group: "Clients" | "Applicatif" | "Données" | "Réseau" | "Services tiers" | "Exploitation";
  /** Default reachability when nothing else says otherwise. */
  exposure: "public" | "private" | "managed";
  hint: string;
  techs: string[];
}

export const KINDS: Record<ComponentKind, KindInfo> = {
  frontend: { label: "Front-end", group: "Clients", exposure: "public", hint: "Site ou application web servie au navigateur", techs: ["nextjs", "nuxt", "sveltekit", "astro", "react", "vue", "angular", "wordpress", "drupal"] },
  mobile: { label: "App mobile", group: "Clients", exposure: "managed", hint: "Application iOS / Android", techs: ["react-native", "flutter", "swift", "kotlin", "expo"] },
  backend: { label: "Back-end", group: "Applicatif", exposure: "private", hint: "Service applicatif, logique métier", techs: ["nestjs", "express", "fastify", "laravel", "symfony", "django", "fastapi", "rails", "spring-boot", "dotnet", "go"] },
  api: { label: "API", group: "Applicatif", exposure: "public", hint: "Point d'entrée API exposé aux clients", techs: ["nestjs", "express", "fastapi", "laravel", "spring-boot", "dotnet", "go", "graphql"] },
  database: { label: "Base de données", group: "Données", exposure: "private", hint: "Stockage persistant structuré", techs: ["postgresql", "mysql", "mariadb", "mongodb", "sqlserver", "sqlite"] },
  cache: { label: "Cache", group: "Données", exposure: "private", hint: "Cache mémoire, sessions", techs: ["redis", "valkey", "memcached"] },
  queue: { label: "File de messages", group: "Données", exposure: "private", hint: "Traitements asynchrones", techs: ["rabbitmq", "kafka", "nats", "sqs", "pg-boss"] },
  storage: { label: "Stockage objet", group: "Données", exposure: "private", hint: "Fichiers, médias, téléversements", techs: ["s3", "minio", "r2", "gcs", "azure-blob"] },
  cdn: { label: "CDN", group: "Réseau", exposure: "public", hint: "Distribution et cache en bordure", techs: ["cloudflare", "cloudfront", "fastly", "bunny", "akamai"] },
  waf: { label: "Pare-feu applicatif", group: "Réseau", exposure: "public", hint: "Filtrage des requêtes malveillantes", techs: ["cloudflare", "crowdsec", "modsecurity", "aws-waf"] },
  "load-balancer": { label: "Répartiteur de charge", group: "Réseau", exposure: "public", hint: "Reverse proxy, terminaison TLS", techs: ["nginx", "caddy", "traefik", "haproxy", "alb"] },
  dns: { label: "DNS", group: "Réseau", exposure: "public", hint: "Résolution du nom de domaine", techs: ["cloudflare", "route53", "ovh", "gandi"] },
  payment: { label: "Paiement", group: "Services tiers", exposure: "managed", hint: "Prestataire de paiement", techs: ["stripe", "paypal", "wave", "orange-money", "paydunya", "cinetpay", "adyen"] },
  email: { label: "E-mail", group: "Services tiers", exposure: "managed", hint: "Envoi d'e-mails transactionnels", techs: ["resend", "brevo", "sendgrid", "mailgun", "ses", "postmark", "smtp"] },
  idp: { label: "Identité / SSO", group: "Services tiers", exposure: "managed", hint: "Fournisseur d'identité", techs: ["keycloak", "better-auth", "auth0", "entra-id", "google", "zitadel"] },
  ai: { label: "Service d'IA", group: "Services tiers", exposure: "managed", hint: "Modèle de langage, vision…", techs: ["claude", "mistral", "ollama", "vllm"] },
  analytics: { label: "Mesure d'audience", group: "Services tiers", exposure: "managed", hint: "Statistiques de visite", techs: ["matomo", "plausible", "umami", "google-analytics"] },
  external: { label: "Système externe", group: "Services tiers", exposure: "managed", hint: "API d'un partenaire, SI existant", techs: [] },
  monitoring: { label: "Supervision", group: "Exploitation", exposure: "private", hint: "Métriques, alertes, disponibilité", techs: ["prometheus", "grafana", "uptime-kuma", "sentry", "datadog", "betterstack"] },
  logging: { label: "Journalisation", group: "Exploitation", exposure: "private", hint: "Centralisation des journaux", techs: ["loki", "elasticsearch", "opensearch", "graylog"] },
  backup: { label: "Sauvegarde", group: "Exploitation", exposure: "private", hint: "Sauvegardes externalisées", techs: ["restic", "borg", "pgbackrest", "velero", "barman"] },
  secrets: { label: "Coffre à secrets", group: "Exploitation", exposure: "private", hint: "Clés, mots de passe, jetons", techs: ["vault", "openbao", "infisical", "sops", "doppler"] },
};

export const ACTORS: Record<ActorKind, { label: string; hint: string }> = {
  visitor: { label: "Visiteur", hint: "Internaute anonyme" },
  user: { label: "Utilisateur", hint: "Utilisateur connecté" },
  admin: { label: "Administrateur", hint: "Équipe d'administration" },
  partner: { label: "Partenaire", hint: "Organisation tierce" },
  system: { label: "Système", hint: "Autre système automatisé" },
};

export const PROJECT_TYPE_LABELS = {
  showcase: "Site vitrine",
  ecommerce: "E-commerce",
  saas: "SaaS",
  "mobile-api": "Application mobile + API",
  api: "API publique",
  "public-service": "Service public en ligne",
  "internal-tool": "Outil interne",
  other: "Autre",
} as const;

export const FEATURE_LABELS = {
  accounts: "Comptes utilisateurs",
  admin: "Back-office d'administration",
  payment: "Paiement en ligne",
  forms: "Formulaires",
  newsletter: "Newsletter",
  uploads: "Téléversement de fichiers",
  ai: "Fonctions d'IA",
  analytics: "Mesure d'audience",
  email: "E-mails transactionnels",
} as const;

export const DATA_LABELS = {
  identity: "Identité",
  contact: "Coordonnées",
  location: "Localisation",
  usage: "Données d'usage",
  payment: "Paiement",
  financial: "Données financières",
  health: "Santé",
  biometric: "Biométrie",
  minors: "Mineurs",
  religion: "Convictions religieuses",
  political: "Opinions politiques",
  judicial: "Données judiciaires",
  "national-id": "Numéro d'identification national",
} as const;

export const COUNTRIES: Record<string, string> = {
  SN: "Sénégal",
  CI: "Côte d'Ivoire",
  ML: "Mali",
  BF: "Burkina Faso",
  BJ: "Bénin",
  TG: "Togo",
  NE: "Niger",
  GN: "Guinée",
  CM: "Cameroun",
  MA: "Maroc",
  TN: "Tunisie",
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  DE: "Allemagne",
  NL: "Pays-Bas",
  IE: "Irlande",
  ES: "Espagne",
  IT: "Italie",
  PT: "Portugal",
  LU: "Luxembourg",
  GB: "Royaume-Uni",
  US: "États-Unis",
  CA: "Canada",
  ZA: "Afrique du Sud",
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
};

export const EU_EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
]);

/**
 * End-of-life dates (security support end), snapshot of endoflife.date.
 * Keys are matched on the longest prefix: "8.1.3" → "8.1" → "8".
 */
export const EOL_SNAPSHOT = "2026-11-01";
export const EOL: Record<string, Record<string, string>> = {
  nodejs: { "14": "2023-04-30", "16": "2023-09-11", "18": "2025-04-30", "20": "2026-04-30", "22": "2027-04-30", "24": "2028-04-30" },
  php: { "7.4": "2022-11-28", "8.0": "2023-11-26", "8.1": "2025-12-31", "8.2": "2026-12-31", "8.3": "2027-12-31", "8.4": "2028-12-31" },
  python: { "3.8": "2024-10-07", "3.9": "2025-10-31", "3.10": "2026-10-31", "3.11": "2027-10-31", "3.12": "2028-10-31", "3.13": "2029-10-31" },
  postgresql: { "11": "2023-11-09", "12": "2024-11-21", "13": "2025-11-13", "14": "2026-11-12", "15": "2027-11-11", "16": "2028-11-09", "17": "2029-11-08" },
  mysql: { "5.7": "2023-10-31", "8.0": "2026-04-30", "8.4": "2032-04-30" },
  mongodb: { "5.0": "2024-10-31", "6.0": "2025-07-31", "7.0": "2027-08-31" },
  django: { "3.2": "2024-04-01", "4.2": "2026-04-30", "5.2": "2028-04-30" },
  laravel: { "9": "2024-02-06", "10": "2025-02-04", "11": "2026-03-12", "12": "2027-02-24" },
  angular: { "15": "2024-05-18", "16": "2024-11-08", "17": "2025-05-15", "18": "2025-11-21", "19": "2026-05-19" },
  vue: { "2": "2023-12-31" },
  "spring-boot": { "2.7": "2023-11-24", "3.2": "2024-11-23", "3.3": "2025-05-23", "3.4": "2025-11-20" },
  dotnet: { "6": "2024-11-12", "7": "2024-05-14", "8": "2026-11-10", "9": "2026-11-10" },
  ruby: { "3.0": "2024-04-23", "3.1": "2025-03-31", "3.2": "2026-03-31" },
  rails: { "6.1": "2024-10-01", "7.0": "2025-04-01", "7.1": "2025-10-01" },
  ubuntu: { "18.04": "2023-05-31", "20.04": "2025-05-31", "22.04": "2027-06-01", "24.04": "2029-05-31" },
  debian: { "10": "2024-06-30", "11": "2026-08-31", "12": "2028-06-30" },
};

/** Aliases so that `node@20` or `postgres@16` resolve. */
export const TECH_ALIASES: Record<string, string> = {
  node: "nodejs",
  "node.js": "nodejs",
  postgres: "postgresql",
  pg: "postgresql",
  mongo: "mongodb",
  ".net": "dotnet",
  "asp.net": "dotnet",
  springboot: "spring-boot",
};

export function eolDate(name: string, version: string | undefined): { date: string; cycle: string } | undefined {
  if (!version) return undefined;
  const table = EOL[TECH_ALIASES[name] ?? name];
  if (!table) return undefined;
  const parts = version.replace(/^v/, "").split(".");
  for (let n = parts.length; n > 0; n--) {
    const cycle = parts.slice(0, n).join(".");
    const date = table[cycle];
    if (date) return { date, cycle };
  }
  return undefined;
}
