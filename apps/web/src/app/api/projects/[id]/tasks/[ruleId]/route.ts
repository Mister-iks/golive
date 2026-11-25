import { z } from "zod";
import { and, eq, logActivity, tasks } from "@golive/db";
import { loadProject } from "@/server/access";
import { forbidden, L, notFound, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const PATCH = route<{ id: string; ruleId: string }>(async ({ req, params, user, as }) => {
  const body = await readJson(req, z.object({ column: z.enum(["todo", "doing", "review", "done"]).optional(), assignee: z.string().nullable().optional() }));
  return as(async (tx) => {
    const { project, rights } = await loadProject(tx, params.id);
    if (!rights.contribute) throw forbidden();
    const [t] = await tx.select().from(tasks).where(and(eq(tasks.projectId, params.id), eq(tasks.ruleId, params.ruleId)));
    if (!t) throw notFound(L("Task not found.", "Tâche introuvable."));
    const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
    if (body.column && body.column !== t.col) {
      set.col = body.column;
      // A task only becomes truly "done" when the audit confirms it.
      set.unconfirmed = body.column === "done";
      set.closedByAudit = false;
    }
    if (body.assignee !== undefined) set.assigneeId = body.assignee;
    await tx.update(tasks).set(set).where(and(eq(tasks.projectId, params.id), eq(tasks.ruleId, params.ruleId)));
    if (set.col) await logActivity(tx, { orgId: project.orgId, projectId: project.id, actorId: user.id, action: "task.moved", target: params.ruleId, meta: { from: t.col, to: set.col } });
    return { ok: true };
  });
});
