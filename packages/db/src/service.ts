import { and, eq, inArray } from "drizzle-orm";
import { evaluate, reconcileTasks, type Report, type TaskState } from "@golive/engine";
import type { WebObservation } from "@golive/packs-sdk";
import type { Spec } from "@golive/spec";
import { activityLog, tasks, type TaskColumn, type WebByEnv } from "./schema";
import type { Db, Tx } from "./index";

type Conn = Db | Tx;

export const today = () => new Date().toISOString().slice(0, 10);

/** The observation the verdict is computed from: the most recent audit, whatever the environment. */
export function currentWeb(web: WebByEnv | null | undefined): WebObservation | undefined {
  const all = Object.values(web ?? {}).filter((w): w is WebObservation => !!w);
  return all.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
}

export function evaluateProject(p: { spec: Spec; web: WebByEnv | null }): Report {
  return evaluate(p.spec, { web: currentWeb(p.web), asOf: today() });
}

type TaskRow = typeof tasks.$inferSelect;

export const toTaskState = (t: TaskRow): TaskState => ({
  id: t.ruleId,
  column: t.col,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  unconfirmed: t.unconfirmed || undefined,
  regression: t.regression || undefined,
  closedByAudit: t.closedByAudit || undefined,
  assignee: t.assigneeId ?? undefined,
});

/**
 * Brings the remediation board in line with a fresh evaluation:
 * one task per open problem, closed when the audit confirms the fix, reopened on regression.
 */
export async function syncTasks(tx: Conn, project: { id: string; orgId: string }, report: Report): Promise<TaskState[]> {
  const rows = await tx.select().from(tasks).where(eq(tasks.projectId, project.id));
  const before = Object.fromEntries(rows.map((r) => [r.ruleId, toTaskState(r)]));
  const next = reconcileTasks(before, report);
  if (!next) return Object.values(before);

  const removed = Object.keys(before).filter((id) => !next[id]);
  if (removed.length) await tx.delete(tasks).where(and(eq(tasks.projectId, project.id), inArray(tasks.ruleId, removed)));
  for (const t of Object.values(next)) {
    const prev = before[t.id];
    if (prev && JSON.stringify(prev) === JSON.stringify(t)) continue;
    const values = {
      projectId: project.id,
      orgId: project.orgId,
      ruleId: t.id,
      col: t.column as TaskColumn,
      unconfirmed: !!t.unconfirmed,
      regression: !!t.regression,
      closedByAudit: !!t.closedByAudit,
      updatedAt: new Date(t.updatedAt),
    };
    await tx
      .insert(tasks)
      .values(values)
      .onConflictDoUpdate({ target: [tasks.projectId, tasks.ruleId], set: values });
  }
  return Object.values(next);
}

export async function logActivity(
  tx: Conn,
  entry: { orgId: string; actorId?: string | null; projectId?: string | null; action: string; target?: string; meta?: Record<string, unknown> },
) {
  await tx.insert(activityLog).values({
    orgId: entry.orgId,
    actorId: entry.actorId ?? null,
    projectId: entry.projectId ?? null,
    action: entry.action,
    target: entry.target,
    meta: entry.meta ?? {},
  });
}
