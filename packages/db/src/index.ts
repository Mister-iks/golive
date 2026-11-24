import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { PgBoss } from "pg-boss";
export type { PgBoss } from "pg-boss";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Database {
  db: Db;
  client: postgres.Sql;
  url: string;
  close: () => Promise<void>;
}

export function connect(url = requireUrl(), options: { max?: number } = {}): Database {
  // search_path is pinned: a role named "golive" would otherwise resolve tables in the golive schema first.
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {}, connection: { search_path: "public" } });
  const db = drizzle(client, { schema });
  return { db, client, url, close: () => client.end({ timeout: 5 }) };
}

export function requireUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas défini. Exemple : postgres://golive:golive@localhost:5432/golive");
  return url;
}

/**
 * Runs fn on behalf of a user, inside a transaction where row level security applies.
 * Every query made with the given tx only sees what that user may see.
 */
export function asUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('golive.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role golive_app`);
    return fn(tx);
  });
}

/* ----------------------------------------------------------------- queue */

export const AUDIT_QUEUE = "audit";

export interface AuditJob {
  auditId: string;
}

/** Job queue stored in the same PostgreSQL database (schema pgboss). */
export async function startQueue(url = requireUrl()): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: url, max: 3 });
  boss.on("error", (e) => console.error("[queue]", e.message));
  await boss.start();
  await boss.createQueue(AUDIT_QUEUE, { retryLimit: 1, retryDelay: 30, expireInSeconds: 600 });
  return boss;
}

export { currentWeb, evaluateProject, logActivity, syncTasks, toTaskState, today } from "./service";
