import { AUDIT_QUEUE, audits, and, connect, inArray, sql, startQueue, type AuditJob } from "@golive/db";
import { migrate } from "@golive/db/migrate";
import { runAudit } from "./audit";

const env = process.env;
const settings = {
  allowPrivate: env.GOLIVE_ALLOW_PRIVATE === "1",
  maxPages: clamp(Number(env.GOLIVE_MAX_PAGES ?? 20), 1, 100),
  budgetMs: clamp(Number(env.GOLIVE_AUDIT_BUDGET_SECONDS ?? 150), 30, 600) * 1000,
};
const concurrency = clamp(Number(env.GOLIVE_WORKER_CONCURRENCY ?? 2), 1, 8);

async function main() {
  if (env.GOLIVE_MIGRATE !== "0") {
    const applied = await migrate();
    console.log(applied.length ? `[migrate] appliquées : ${applied.join(", ")}` : "[migrate] base à jour");
  }
  if (process.argv.includes("--migrate-only")) return;

  const database = connect(undefined, { max: concurrency + 2 });

  // Audits left running by a crashed worker are marked failed rather than stuck forever.
  await database.db
    .update(audits)
    .set({ status: "failed", error: "Interrompu (redémarrage du worker).", finishedAt: new Date() })
    .where(and(inArray(audits.status, ["running"]), sql`started_at < now() - interval '15 minutes'`));

  const boss = await startQueue();
  await boss.work<AuditJob>(AUDIT_QUEUE, { localConcurrency: concurrency }, async ([job]) => {
    if (!job) return;
    const started = Date.now();
    console.log(`[audit] ${job.data.auditId} démarré`);
    await runAudit(database, job.data.auditId, settings);
    console.log(`[audit] ${job.data.auditId} terminé en ${Math.round((Date.now() - started) / 1000)} s`);
  });
  console.log(`[worker] prêt · ${concurrency} audit(s) en parallèle · ${settings.maxPages} pages max${settings.allowPrivate ? " · adresses privées autorisées" : ""}`);

  const stop = async () => {
    console.log("[worker] arrêt…");
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
