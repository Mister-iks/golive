import { audits, eq, evaluateProject, logActivity, projects, syncTasks, type AuditProgress, type Database } from "@golive/db";
import { probe } from "@golive/probe";
import { crawl } from "@golive/robot";

export interface AuditSettings {
  allowPrivate: boolean;
  maxPages: number;
  budgetMs: number;
}

/**
 * Runs one audit end to end: passive probe, optional multi-page crawl,
 * then stores the observation, the verdict and the updated task board.
 * Runs as the database owner (outside row level security): the job only
 * carries an audit id created by an authorized user.
 */
export async function runAudit(database: Database, auditId: string, settings: AuditSettings): Promise<void> {
  const { db } = database;
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
  if (!audit || audit.status === "done" || audit.status === "failed") return;

  const progress = async (p: AuditProgress) => {
    await db.update(audits).set({ progress: p }).where(eq(audits.id, auditId));
  };
  await db.update(audits).set({ status: "running", startedAt: new Date(), progress: { step: "probe" } }).where(eq(audits.id, auditId));

  try {
    const web = await probe(audit.url, { env: audit.env, allowPrivate: settings.allowPrivate });
    if (!web.ok) {
      await finish(database, auditId, { status: "failed", error: web.error ?? "Site unreachable.", observation: web });
      return;
    }

    if (audit.kind === "full") {
      let last = 0;
      await progress({ step: "crawl", pages: 0, maxPages: settings.maxPages });
      web.crawl = await crawl(web.finalUrl, {
        maxPages: settings.maxPages,
        budgetMs: settings.budgetMs,
        allowPrivate: settings.allowPrivate,
        onProgress: (p) => {
          // At most one progress write per second.
          if (Date.now() - last < 1000) return;
          last = Date.now();
          void progress({ step: "crawl", pages: p.pages, maxPages: p.maxPages });
        },
      });
    }

    await progress({ step: "evaluate" });
    await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, audit.projectId)).for("update");
      if (!project) throw new Error("Project deleted during the audit.");
      const webByEnv = { ...(project.web ?? {}), [audit.env]: web };
      const report = evaluateProject({ spec: project.spec, web: webByEnv });
      await tx.update(projects).set({ web: webByEnv, updatedAt: new Date() }).where(eq(projects.id, project.id));
      await syncTasks(tx, project, report);
      await tx
        .update(audits)
        .set({
          status: "done",
          observation: web,
          verdict: report.verdict.decision,
          score: report.score.global,
          fingerprint: report.fingerprint,
          progress: { step: "done", pages: web.crawl?.pages.length, maxPages: web.crawl?.maxPages },
          finishedAt: new Date(),
        })
        .where(eq(audits.id, auditId));
      await logActivity(tx, {
        orgId: project.orgId,
        projectId: project.id,
        actorId: audit.requestedBy,
        action: "audit.done",
        target: audit.url,
        meta: { auditId, kind: audit.kind, env: audit.env, verdict: report.verdict.decision, score: report.score.global, pages: web.crawl?.pages.length ?? 1 },
      });
    });
  } catch (e) {
    await finish(database, auditId, { status: "failed", error: (e as Error).message });
    throw e;
  }
}

async function finish(database: Database, auditId: string, values: { status: "failed"; error: string; observation?: object }) {
  await database.db
    .update(audits)
    .set({ ...values, observation: values.observation as never, finishedAt: new Date(), progress: { step: "done" } })
    .where(eq(audits.id, auditId));
}
