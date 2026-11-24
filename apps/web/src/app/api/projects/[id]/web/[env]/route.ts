import { eq, evaluateProject, projects, syncTasks } from "@golive/db";
import { loadProject } from "@/server/access";
import { forbidden, route } from "@/server/http";

export const runtime = "nodejs";

/** Forgets the latest observation of one environment. */
export const DELETE = route<{ id: string; env: string }>(async ({ params, as }) =>
  as(async (tx) => {
    const { project, rights } = await loadProject(tx, params.id);
    if (!rights.contribute) throw forbidden();
    const web = { ...(project.web ?? {}) };
    delete web[params.env as "prod" | "preprod"];
    const [saved] = await tx.update(projects).set({ web }).where(eq(projects.id, params.id)).returning();
    return { tasks: await syncTasks(tx, saved!, evaluateProject(saved!)) };
  }),
);
