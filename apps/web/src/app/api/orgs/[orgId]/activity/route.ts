import { activityLog, desc, eq, projects, users } from "@golive/db";
import { orgRole, requireOrgAdmin } from "@/server/access";
import { route } from "@/server/http";

export const runtime = "nodejs";

export const GET = route<{ orgId: string }>(async ({ params, as }) =>
  as(async (tx) => {
    requireOrgAdmin(await orgRole(tx, params.orgId));
    const rows = await tx
      .select({ id: activityLog.id, at: activityLog.at, action: activityLog.action, target: activityLog.target, meta: activityLog.meta, actor: users.name, project: projects.name })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorId))
      .leftJoin(projects, eq(projects.id, activityLog.projectId))
      .where(eq(activityLog.orgId, params.orgId))
      .orderBy(desc(activityLog.id))
      .limit(300);
    return rows;
  }),
);
