import { z } from "zod";
import { and, eq, logActivity, orgMembers, projectMembers, users } from "@golive/db";
import { loadProject } from "@/server/access";
import { forbidden, HttpError, readJson, route } from "@/server/http";

export const runtime = "nodejs";

type P = { id: string };

export const GET = route<P>(async ({ params, as }) =>
  as(async (tx) => {
    const { project, rights } = await loadProject(tx, params.id);
    const explicit = await tx
      .select({ userId: users.id, name: users.name, email: users.email, role: projectMembers.role, expiresAt: projectMembers.expiresAt })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, params.id));
    const org = await tx
      .select({ userId: users.id, name: users.name, email: users.email, orgRole: orgMembers.role })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, project.orgId));
    return { rights, members: explicit, org };
  }),
);

export const PUT = route<P>(async ({ req, params, user, as }) => {
  const body = await readJson(
    req,
    z.object({ userId: z.string(), role: z.enum(["responsable", "editeur", "contributeur", "lecteur", "valideur"]), expiresAt: z.iso.date().nullish() }),
  );
  return as(async (tx) => {
    const { project, rights } = await loadProject(tx, params.id);
    if (!rights.manage) throw forbidden("Seul le responsable du projet gère les accès.");
    const [m] = await tx.select().from(orgMembers).where(and(eq(orgMembers.orgId, project.orgId), eq(orgMembers.userId, body.userId)));
    if (!m) throw new HttpError(400, "Invitez d'abord cette personne dans l'organisation.");
    const values = { projectId: params.id, userId: body.userId, orgId: project.orgId, role: body.role, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null };
    await tx.insert(projectMembers).values(values).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: values.role, expiresAt: values.expiresAt } });
    await logActivity(tx, { orgId: project.orgId, projectId: project.id, actorId: user.id, action: "project.access", target: body.userId, meta: { role: body.role } });
  });
});

export const DELETE = route<P>(async ({ req, params, user, as }) => {
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  return as(async (tx) => {
    const { project, rights } = await loadProject(tx, params.id);
    if (!rights.manage && userId !== user.id) throw forbidden("Seul le responsable du projet gère les accès.");
    await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, params.id), eq(projectMembers.userId, userId)));
    await logActivity(tx, { orgId: project.orgId, projectId: project.id, actorId: user.id, action: "project.access.removed", target: userId });
  });
});
