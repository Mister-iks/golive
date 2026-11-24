import { z } from "zod";

/**
 * GoLive Spec v1: the open, hand-editable description of a project.
 * Licensed Apache-2.0 so that any tool (or State) can adopt it.
 */

export const SPEC_VERSION = "golive/v1" as const;

export const PROJECT_TYPES = [
  "showcase",
  "ecommerce",
  "saas",
  "mobile-api",
  "api",
  "public-service",
  "internal-tool",
  "other",
] as const;

export const AUDIENCES = ["public", "authenticated", "internal"] as const;

export const CRITICALITY = ["standard", "financial", "health", "public-service"] as const;

export const PERSONAL_DATA = ["identity", "contact", "location", "usage", "payment", "financial"] as const;
export const SENSITIVE_DATA = ["health", "biometric", "minors", "religion", "political", "judicial", "national-id"] as const;

export const FEATURES = [
  "accounts",
  "admin",
  "payment",
  "forms",
  "newsletter",
  "uploads",
  "ai",
  "analytics",
  "email",
] as const;

export const COMPONENT_KINDS = [
  "frontend",
  "mobile",
  "backend",
  "api",
  "database",
  "cache",
  "queue",
  "storage",
  "cdn",
  "waf",
  "load-balancer",
  "dns",
  "payment",
  "email",
  "idp",
  "ai",
  "monitoring",
  "logging",
  "backup",
  "secrets",
  "analytics",
  "external",
] as const;

export const ACTOR_KINDS = ["visitor", "user", "admin", "partner", "system"] as const;

export const PROTOCOLS = [
  "https",
  "http",
  "wss",
  "ws",
  "grpcs",
  "grpc",
  "tls",
  "mtls",
  "postgres-tls",
  "postgres",
  "mysql-tls",
  "mysql",
  "mongodb-tls",
  "mongodb",
  "rediss",
  "redis",
  "amqps",
  "amqp",
  "kafka-tls",
  "kafka",
  "smtps",
  "smtp",
  "sftp",
  "ftp",
  "s3",
  "internal",
] as const;

/** Protocols considered encrypted in transit. */
export const ENCRYPTED_PROTOCOLS: ReadonlySet<Protocol> = new Set<Protocol>([
  "https",
  "wss",
  "grpcs",
  "tls",
  "mtls",
  "postgres-tls",
  "mysql-tls",
  "mongodb-tls",
  "rediss",
  "amqps",
  "kafka-tls",
  "smtps",
  "sftp",
  "s3",
]);

export const SENSITIVITY = ["public", "internal", "personal", "sensitive"] as const;

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/i, "id: lettres, chiffres, - et _ uniquement");

const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "code pays ISO 3166-1 alpha-2 attendu (ex. SN, FR)");

export const hostingSchema = z.object({
  provider: z.string().min(1).optional(),
  country: countrySchema.optional(),
  region: z.string().optional(),
});

export const zoneSchema = z.object({
  id: idSchema,
  name: z.string().optional(),
  provider: z.string().optional(),
  country: countrySchema.optional(),
  region: z.string().optional(),
  network: z.enum(["public", "private"]).default("private"),
});

export const componentSchema = z.object({
  id: idSchema,
  kind: z.enum(COMPONENT_KINDS),
  name: z.string().optional(),
  /** `name@version`, e.g. `postgresql@17`. */
  tech: z.string().optional(),
  /** Underlying runtime or OS, e.g. `php@8.3`, `nodejs@22`, `ubuntu@24.04`. */
  runtime: z.string().optional(),
  /** Reachable from the Internet? Defaults depend on kind (see engine). */
  exposure: z.enum(["public", "private"]).optional(),
  zone: idSchema.optional(),
  hosting: hostingSchema.optional(),
  /** Free-form notes kept with the component. */
  notes: z.string().optional(),
});

export const actorSchema = z.object({
  id: idSchema,
  kind: z.enum(ACTOR_KINDS),
  name: z.string().optional(),
});

export const linkSchema = z.object({
  from: idSchema,
  to: idSchema,
  protocol: z.enum(PROTOCOLS).default("https"),
  sensitivity: z.enum(SENSITIVITY).optional(),
  label: z.string().optional(),
});

export const evidenceSchema = z.object({
  by: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ"),
  note: z.string().optional(),
  url: z.string().optional(),
});

export const waiverSchema = z.object({
  rule: z.string().min(1),
  target: z.string().optional(),
  reason: z.string().min(1),
  owner: z.string().min(1),
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ"),
  plan: z.string().optional(),
});

export const specSchema = z.object({
  spec: z.literal(SPEC_VERSION),
  project: z.object({
    name: z.string().min(1),
    type: z.enum(PROJECT_TYPES).default("other"),
    description: z.string().optional(),
    countries: z.array(countrySchema).default([]),
    languages: z.array(z.string()).default([]),
    audience: z.enum(AUDIENCES).default("public"),
    criticality: z.enum(CRITICALITY).default("standard"),
  }),
  data: z
    .object({
      personal: z.array(z.enum(PERSONAL_DATA)).default([]),
      sensitive: z.array(z.enum(SENSITIVE_DATA)).default([]),
    })
    .default({ personal: [], sensitive: [] }),
  features: z.array(z.enum(FEATURES)).default([]),
  zones: z.array(zoneSchema).default([]),
  actors: z.array(actorSchema).default([]),
  components: z.array(componentSchema).default([]),
  links: z.array(linkSchema).default([]),
  targets: z
    .object({
      preprod: z.url().optional(),
      prod: z.url().optional(),
      repository: z.string().optional(),
    })
    .default({}),
  profiles: z.array(z.string()).default([]),
  evidence: z.record(z.string(), evidenceSchema).default({}),
  waivers: z.array(waiverSchema).default([]),
  /** Studio layout. Positions only, never read by the engine. */
  layout: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
});

export type Spec = z.infer<typeof specSchema>;
export type SpecInput = z.input<typeof specSchema>;
export type Component = z.infer<typeof componentSchema>;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export type Actor = z.infer<typeof actorSchema>;
export type ActorKind = (typeof ACTOR_KINDS)[number];
export type Link = z.infer<typeof linkSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export type Protocol = (typeof PROTOCOLS)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type Feature = (typeof FEATURES)[number];
export type PersonalData = (typeof PERSONAL_DATA)[number];
export type SensitiveData = (typeof SENSITIVE_DATA)[number];
export type Evidence = z.infer<typeof evidenceSchema>;
export type Waiver = z.infer<typeof waiverSchema>;
