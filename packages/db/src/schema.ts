/**
 * Typed view of the tables created by migrations/*.sql.
 * The SQL files are the source of truth (they also hold roles, RLS and triggers).
 */
import { bigserial, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Spec } from "@golive/spec";
import type { WebObservation } from "@golive/packs-sdk";

const uuid = () => crypto.randomUUID();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ---------------------------------------------------- Better Auth tables */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const twoFactors = pgTable("two_factors", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull(),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: ts("locked_until"),
});

/* ---------------------------------------------------------- tenancy */

export type OrgRole = "owner" | "admin" | "member" | "guest";
export type ProjectRole = "responsable" | "editeur" | "contributeur" | "lecteur" | "valideur";

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").$type<OrgRole>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export type WebByEnv = Partial<Record<"prod" | "preprod", WebObservation>>;

export const projects = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(uuid),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  spec: jsonb("spec").$type<Spec>().notNull(),
  revision: integer("revision").notNull().default(1),
  web: jsonb("web").$type<WebByEnv>(),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
    role: text("role").$type<ProjectRole>().notNull(),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export interface InvitedProject {
  projectId: string;
  role: ProjectRole;
}

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey().$defaultFn(uuid),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  orgRole: text("org_role").$type<Exclude<OrgRole, "owner">>().notNull(),
  projects: jsonb("projects").$type<InvitedProject[]>().notNull().default([]),
  accessExpiresAt: ts("access_expires_at"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by"),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedBy: text("accepted_by"),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/* ---------------------------------------------------- audits and tasks */

export type AuditStatus = "queued" | "running" | "done" | "failed";
export type AuditKind = "quick" | "full";
export interface AuditProgress {
  step?: string;
  pages?: number;
  maxPages?: number;
}

export const audits = pgTable("audits", {
  id: text("id").primaryKey().$defaultFn(uuid),
  projectId: text("project_id").notNull(),
  orgId: text("org_id").notNull(),
  env: text("env").$type<"prod" | "preprod">().notNull(),
  kind: text("kind").$type<AuditKind>().notNull(),
  url: text("url").notNull(),
  status: text("status").$type<AuditStatus>().notNull().default("queued"),
  progress: jsonb("progress").$type<AuditProgress>().notNull().default({}),
  requestedBy: text("requested_by"),
  observation: jsonb("observation").$type<WebObservation>(),
  verdict: text("verdict"),
  score: integer("score"),
  fingerprint: text("fingerprint"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
});

export type TaskColumn = "todo" | "doing" | "review" | "done";

export const tasks = pgTable(
  "tasks",
  {
    projectId: text("project_id").notNull(),
    orgId: text("org_id").notNull(),
    ruleId: text("rule_id").notNull(),
    col: text("col").$type<TaskColumn>().notNull().default("todo"),
    assigneeId: text("assignee_id"),
    unconfirmed: boolean("unconfirmed").notNull().default(false),
    regression: boolean("regression").notNull().default(false),
    closedByAudit: boolean("closed_by_audit").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.ruleId] })],
);

export const domainVerifications = pgTable("domain_verifications", {
  id: text("id").primaryKey().$defaultFn(uuid),
  orgId: text("org_id").notNull(),
  hostname: text("hostname").notNull(),
  token: text("token").notNull(),
  method: text("method").$type<"dns" | "file">(),
  verifiedAt: ts("verified_at"),
  checkedAt: ts("checked_at"),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: text("org_id").notNull(),
  projectId: text("project_id"),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  at: ts("at").notNull().defaultNow(),
});
