import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { requireUrl } from "./index";

/* ------------------------------------------------------------ migrations */

const DEFAULT_DIR = () => process.env.GOLIVE_MIGRATIONS_DIR ?? fileURLToPath(new URL("../migrations", import.meta.url));

/** Applies pending migrations/*.sql in order, once, under an advisory lock. */
export async function migrate(url = requireUrl(), dir = DEFAULT_DIR()): Promise<string[]> {
  const client = postgres(url, { max: 1, onnotice: () => {}, connection: { search_path: "public" } });
  const applied: string[] = [];
  try {
    await client`select pg_advisory_lock(727274)`;
    await client`create schema if not exists golive`;
    await client`create table if not exists golive.migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await client<{ name: string }[]>`select name from golive.migrations`).map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const text = readFileSync(join(dir, file), "utf8");
      await client.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into golive.migrations (name) values (${file})`;
      });
      applied.push(file);
    }
    await client`select pg_advisory_unlock(727274)`;
  } finally {
    await client.end({ timeout: 5 });
  }
  return applied;
}

