import { z } from "zod";
import { eq, logActivity, projects } from "@golive/db";
import { loadProject } from "@/server/access";
import { forbidden, L, readJson, route } from "@/server/http";
import { projectDto, saveSpec } from "@/server/projects";

export const runtime = "nodejs";

type P = { id: string };

export const GET = route<P>(async ({ params, as }) => as((tx) => projectDto(tx, params.id)));

export const PUT = route<P>(async ({ req, params, user, as }) => {
  const body = await readJson(req, z.object({ spec: z.unknown(), revision: z.number().int() }));
  return as((tx) => saveSpec(tx, user, params.id, body.spec, body.revision));
});

export const DELETE = route<P>(async ({ params, user, as }) =>
  as(async (tx) => {
    const { project, rights } = await loadProject(tx, params.id);
    if (!rights.manage) throw forbidden(L("Only the project manager can delete it.", "Seul le responsable du projet peut le supprimer."));
    await tx.delete(projects).where(eq(projects.id, params.id));
    await logActivity(tx, { orgId: project.orgId, actorId: user.id, action: "project.deleted", target: project.name, meta: { projectId: project.id } });
  }),
);
