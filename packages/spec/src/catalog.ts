import type { ActorKind, ComponentKind } from "./schema";

export type KindGroup = "clients" | "app" | "data" | "network" | "third-party" | "operations";

export interface KindInfo {
  label: string;
  group: KindGroup;
  /** Default reachability when nothing else says otherwise. */
  exposure: "public" | "private" | "managed";
  hint: string;
  techs: string[];
}

export const KINDS: Record<ComponentKind, KindInfo> = {
  frontend: { label: "Front-end", group: "clients", exposure: "public", hint: "Website or web app served to the browser", techs: ["nextjs", "nuxt", "sveltekit", "astro", "react", "vue", "angular", "wordpress", "drupal"] },
  mobile: { label: "Mobile app", group: "clients", exposure: "managed", hint: "iOS / Android application", techs: ["react-native", "flutter", "swift", "kotlin", "expo"] },
  backend: { label: "Back-end", group: "app", exposure: "private", hint: "Application service, business logic", techs: ["nestjs", "express", "fastify", "laravel", "symfony", "django", "fastapi", "rails", "spring-boot", "dotnet", "go"] },
  api: { label: "API", group: "app", exposure: "public", hint: "API entry point exposed to clients", techs: ["nestjs", "express", "fastapi", "laravel", "spring-boot", "dotnet", "go", "graphql"] },
  database: { label: "Database", group: "data", exposure: "private", hint: "Structured persistent storage", techs: ["postgresql", "mysql", "mariadb", "mongodb", "sqlserver", "sqlite"] },
  cache: { label: "Cache", group: "data", exposure: "private", hint: "In-memory cache, sessions", techs: ["redis", "valkey", "memcached"] },
  queue: { label: "Message queue", group: "data", exposure: "private", hint: "Asynchronous processing", techs: ["rabbitmq", "kafka", "nats", "sqs", "pg-boss"] },
  storage: { label: "Object storage", group: "data", exposure: "private", hint: "Files, media, uploads", techs: ["s3", "minio", "r2", "gcs", "azure-blob"] },
  cdn: { label: "CDN", group: "network", exposure: "public", hint: "Edge distribution and caching", techs: ["cloudflare", "cloudfront", "fastly", "bunny", "akamai"] },
  waf: { label: "Web application firewall", group: "network", exposure: "public", hint: "Filters malicious requests", techs: ["cloudflare", "crowdsec", "modsecurity", "aws-waf"] },
  "load-balancer": { label: "Load balancer", group: "network", exposure: "public", hint: "Reverse proxy, TLS termination", techs: ["nginx", "caddy", "traefik", "haproxy", "alb"] },
  dns: { label: "DNS", group: "network", exposure: "public", hint: "Domain name resolution", techs: ["cloudflare", "route53", "ovh", "gandi"] },
  payment: { label: "Payment", group: "third-party", exposure: "managed", hint: "Payment provider", techs: ["stripe", "paypal", "wave", "orange-money", "paydunya", "cinetpay", "adyen"] },
  email: { label: "E-mail", group: "third-party", exposure: "managed", hint: "Transactional e-mail delivery", techs: ["resend", "brevo", "sendgrid", "mailgun", "ses", "postmark", "smtp"] },
  idp: { label: "Identity / SSO", group: "third-party", exposure: "managed", hint: "Identity provider", techs: ["keycloak", "better-auth", "auth0", "entra-id", "google", "zitadel"] },
  ai: { label: "AI service", group: "third-party", exposure: "managed", hint: "Language model, vision…", techs: ["claude", "mistral", "ollama", "vllm"] },
  analytics: { label: "Analytics", group: "third-party", exposure: "managed", hint: "Visit statistics", techs: ["matomo", "plausible", "umami", "google-analytics"] },
  external: { label: "External system", group: "third-party", exposure: "managed", hint: "Partner API, existing system", techs: [] },
  monitoring: { label: "Monitoring", group: "operations", exposure: "private", hint: "Metrics, alerts, uptime", techs: ["prometheus", "grafana", "uptime-kuma", "sentry", "datadog", "betterstack"] },
  logging: { label: "Logging", group: "operations", exposure: "private", hint: "Centralized logs", techs: ["loki", "elasticsearch", "opensearch", "graylog"] },
  backup: { label: "Backup", group: "operations", exposure: "private", hint: "Off-site backups", techs: ["restic", "borg", "pgbackrest", "velero", "barman"] },
  secrets: { label: "Secrets vault", group: "operations", exposure: "private", hint: "Keys, passwords, tokens", techs: ["vault", "openbao", "infisical", "sops", "doppler"] },
};

export const ACTORS: Record<ActorKind, { label: string; hint: string }> = {
  visitor: { label: "Visitor", hint: "Anonymous visitor" },
  user: { label: "User", hint: "Signed-in user" },
  admin: { label: "Administrator", hint: "Administration team" },
  partner: { label: "Partner", hint: "Third-party organization" },
  system: { label: "System", hint: "Another automated system" },
};

export const PROJECT_TYPE_LABELS = {
  showcase: "Showcase website",
  ecommerce: "E-commerce",
  saas: "SaaS",
  "mobile-api": "Mobile app + API",
  api: "Public API",
  "public-service": "Online public service",
  "internal-tool": "Internal tool",
  other: "Other",
} as Record<string, string> & { showcase: string; ecommerce: string; saas: string; "mobile-api": string; api: string; "public-service": string; "internal-tool": string; other: string };

export const FEATURE_LABELS = {
  accounts: "User accounts",
  admin: "Admin back office",
  payment: "Online payment",
  forms: "Forms",
  newsletter: "Newsletter",
  uploads: "File uploads",
  ai: "AI features",
  analytics: "Analytics",
  email: "Transactional e-mails",
} as const;

export const DATA_LABELS = {
  identity: "Identity",
  contact: "Contact details",
  location: "Location",
  usage: "Usage data",
  payment: "Payment",
  financial: "Financial data",
  health: "Health",
  biometric: "Biometrics",
  minors: "Minors",
  religion: "Religious beliefs",
  political: "Political opinions",
  judicial: "Judicial data",
  "national-id": "National ID number",
} as const;

export const COUNTRIES: Record<string, string> = {
  SN: "Senegal",
  CI: "Côte d'Ivoire",
  ML: "Mali",
  BF: "Burkina Faso",
  BJ: "Benin",
  TG: "Togo",
  NE: "Niger",
  GN: "Guinea",
  CM: "Cameroon",
  MA: "Morocco",
  TN: "Tunisia",
  FR: "France",
  BE: "Belgium",
  CH: "Switzerland",
  DE: "Germany",
  NL: "Netherlands",
  IE: "Ireland",
  ES: "Spain",
  IT: "Italy",
  PT: "Portugal",
  LU: "Luxembourg",
  GB: "United Kingdom",
  US: "United States",
  CA: "Canada",
  ZA: "South Africa",
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
};

/* ---------------------------------------------------------------- languages */

export type CatalogLang = "en" | "fr";

export const KIND_GROUP_LABELS: Record<CatalogLang, Record<KindGroup, string>> = {
  en: { clients: "Clients", app: "Application", data: "Data", network: "Network", "third-party": "Third-party services", operations: "Operations" },
  fr: { clients: "Clients", app: "Applicatif", data: "Données", network: "Réseau", "third-party": "Services tiers", operations: "Exploitation" },
};

const KINDS_FR: Record<ComponentKind, { label: string; hint: string }> = {
  frontend: { label: "Front-end", hint: "Site ou application web servie au navigateur" },
  mobile: { label: "App mobile", hint: "Application iOS / Android" },
  backend: { label: "Back-end", hint: "Service applicatif, logique métier" },
  api: { label: "API", hint: "Point d'entrée API exposé aux clients" },
  database: { label: "Base de données", hint: "Stockage persistant structuré" },
  cache: { label: "Cache", hint: "Cache mémoire, sessions" },
  queue: { label: "File de messages", hint: "Traitements asynchrones" },
  storage: { label: "Stockage objet", hint: "Fichiers, médias, téléversements" },
  cdn: { label: "CDN", hint: "Distribution et cache en bordure" },
  waf: { label: "Pare-feu applicatif", hint: "Filtrage des requêtes malveillantes" },
  "load-balancer": { label: "Répartiteur de charge", hint: "Reverse proxy, terminaison TLS" },
  dns: { label: "DNS", hint: "Résolution du nom de domaine" },
  payment: { label: "Paiement", hint: "Prestataire de paiement" },
  email: { label: "E-mail", hint: "Envoi d'e-mails transactionnels" },
  idp: { label: "Identité / SSO", hint: "Fournisseur d'identité" },
  ai: { label: "Service d'IA", hint: "Modèle de langage, vision…" },
  analytics: { label: "Mesure d'audience", hint: "Statistiques de visite" },
  external: { label: "Système externe", hint: "API d'un partenaire, SI existant" },
  monitoring: { label: "Supervision", hint: "Métriques, alertes, disponibilité" },
  logging: { label: "Journalisation", hint: "Centralisation des journaux" },
  backup: { label: "Sauvegarde", hint: "Sauvegardes externalisées" },
  secrets: { label: "Coffre à secrets", hint: "Clés, mots de passe, jetons" },
};

const ACTORS_FR: Record<ActorKind, { label: string; hint: string }> = {
  visitor: { label: "Visiteur", hint: "Internaute anonyme" },
  user: { label: "Utilisateur", hint: "Utilisateur connecté" },
  admin: { label: "Administrateur", hint: "Équipe d'administration" },
  partner: { label: "Partenaire", hint: "Organisation tierce" },
  system: { label: "Système", hint: "Autre système automatisé" },
};

const LABELS_FR = {
  PROJECT_TYPE_LABELS: {
    showcase: "Site vitrine",
    ecommerce: "E-commerce",
    saas: "SaaS",
    "mobile-api": "Application mobile + API",
    api: "API publique",
    "public-service": "Service public en ligne",
    "internal-tool": "Outil interne",
    other: "Autre",
  },
  FEATURE_LABELS: {
    accounts: "Comptes utilisateurs",
    admin: "Back-office d'administration",
    payment: "Paiement en ligne",
    forms: "Formulaires",
    newsletter: "Newsletter",
    uploads: "Téléversement de fichiers",
    ai: "Fonctions d'IA",
    analytics: "Mesure d'audience",
    email: "E-mails transactionnels",
  },
  DATA_LABELS: {
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
  },
  COUNTRIES: {
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
  } as Record<string, string>,
};

/** The catalogue in one language. English is the default; the shape is the same for every language. */
export function catalog(lang: CatalogLang = "en") {
  if (lang === "en") {
    return { KINDS, ACTORS, PROJECT_TYPE_LABELS, FEATURE_LABELS, DATA_LABELS, COUNTRIES, KIND_GROUPS: KIND_GROUP_LABELS.en };
  }
  const kinds = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { ...v, ...KINDS_FR[k as ComponentKind] }])) as Record<ComponentKind, KindInfo>;
  const actors = Object.fromEntries(Object.entries(ACTORS).map(([k, v]) => [k, { ...v, ...ACTORS_FR[k as ActorKind] }])) as typeof ACTORS;
  return {
    KINDS: kinds,
    ACTORS: actors,
    PROJECT_TYPE_LABELS: { ...PROJECT_TYPE_LABELS, ...LABELS_FR.PROJECT_TYPE_LABELS },
    FEATURE_LABELS: { ...FEATURE_LABELS, ...LABELS_FR.FEATURE_LABELS },
    DATA_LABELS: { ...DATA_LABELS, ...LABELS_FR.DATA_LABELS },
    COUNTRIES: { ...COUNTRIES, ...LABELS_FR.COUNTRIES },
    KIND_GROUPS: KIND_GROUP_LABELS.fr,
  };
}

export type Catalog = ReturnType<typeof catalog>;

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
