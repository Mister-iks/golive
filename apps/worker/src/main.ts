import { AUDIT_QUEUE, audits, and, connect, inArray, sql, startQueue, type AuditJob } from "@golive/db";
import { migrate } from "@golive/db/migrate";
import { hostname } from "node:os";
import { ENGINE_VERSION } from "@golive/engine";
import { runAudit } from "./audit";

const env = process.env;
const settings = {
  allowPrivate: env.GOLIVE_ALLOW_PRIVATE === "1",
  maxPages: clamp(Number(env.GOLIVE_MAX_PAGES ?? 20), 1, 100),
  budgetMs: clamp(Number(env.GOLIVE_AUDIT_BUDGET_SECONDS ?? 150), 30, 600) * 1000,
  lighthouse: env.GOLIVE_LIGHTHOUSE !== "0",
};
const concurrency = clamp(Number(env.GOLIVE_WORKER_CONCURRENCY ?? 2), 1, 8);

async function main() {
  if (env.GOLIVE_MIGRATE !== "0") {
    const applied = await migrate();
    console.log(applied.length ? `[migrate] applied: ${applied.join(", ")}` : "[migrate] database up to date");
  }
  if (process.argv.includes("--migrate-only")) return;

  const database = connect(undefined, { max: concurrency + 2 });

  // Audits left running by a crashed worker are marked failed rather than stuck forever.
  await database.db
    .update(audits)
    .set({ status: "failed", error: "Interrupted (worker restarted).", finishedAt: new Date() })
    .where(and(inArray(audits.status, ["running"]), sql`started_at < now() - interval '15 minutes'`));

  const boss = await startQueue();
  await boss.work<AuditJob>(AUDIT_QUEUE, { localConcurrency: concurrency }, async ([job]) => {
    if (!job) return;
    const started = Date.now();
    console.log(`[audit] ${job.data.auditId} started`);
    await runAudit(database, job.data.auditId, settings);
    console.log(`[audit] ${job.data.auditId} finished in ${Math.round((Date.now() - started) / 1000)} s`);
  });
  console.log(`[worker] ready · ${concurrency} parallel audit(s) · ${settings.maxPages} pages max${settings.allowPrivate ? " · private addresses allowed" : ""}`);

  // Heartbeat read by /api/health: monitoring sees a stopped or stuck worker.
  const id = `${hostname()}:${process.pid}`;
  const beat = () =>
    database.client`insert into golive.worker_heartbeat (id, seen_at, version) values (${id}, now(), ${ENGINE_VERSION})
      on conflict (id) do update set seen_at = now(), version = excluded.version`.catch((e: Error) => console.error("[worker] heartbeat:", e.message));
  await beat();
  const timer = setInterval(beat, 30_000);

  const stop = async () => {
    console.log("[worker] stopping…");
    clearInterval(timer);
    await database.client`delete from golive.worker_heartbeat where id = ${id}`.catch(() => {});
    await boss.stop({ graceful: true, timeout: 30_000 });
    await database.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
