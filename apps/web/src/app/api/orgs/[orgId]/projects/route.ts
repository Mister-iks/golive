import { z } from "zod";
import { desc, eq, evaluateProject, logActivity, projects, sql, syncTasks, type ProjectRole } from "@golive/db";
import { orgRole } from "@/server/access";
import { forbidden, readJson, route } from "@/server/http";
import { parseSpec } from "@/server/projects";

export const runtime = "nodejs";

/** Project list with a server-computed verdict, so large observations stay on the server. */
export const GET = route<{ orgId: string }>(async ({ params, as }) =>
  as(async (tx) => {
    await orgRole(tx, params.orgId);
    const rows = await tx
      .select({ p: projects, role: sql<ProjectRole | null>`golive.project_role(${projects.id})` })
      .from(projects)
      .where(eq(projects.orgId, params.orgId))
      .orderBy(desc(projects.updatedAt));
    return rows.map(({ p, role }) => {
      const r = evaluateProject(p);
      return {
        id: p.id,
        spec: p.spec,
        role,
        updatedAt: p.updatedAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
        summary: { score: r.score.global, threshold: r.threshold, decision: r.verdict.decision, blocking: r.counts.blocking, audited: r.coverage.layers.includes(3) },
      };
    });
  }),
);

export const POST = route<{ orgId: string }>(async ({ req, params, user, as }) => {
  const body = await readJson(req, z.object({ spec: z.unknown() }));
  const spec = parseSpec(body.spec);
  return as(async (tx) => {
    const role = await orgRole(tx, params.orgId);
    if (role === "guest") throw forbidden("Les invités ne peuvent pas créer de projet.");
    const [p] = await tx.insert(projects).values({ orgId: params.orgId, name: spec.project.name, spec, createdBy: user.id }).returning();
    await syncTasks(tx, p!, evaluateProject(p!));
    await logActivity(tx, { orgId: params.orgId, projectId: p!.id, actorId: user.id, action: "project.created", target: spec.project.name });
    return { id: p!.id };
  });
});
