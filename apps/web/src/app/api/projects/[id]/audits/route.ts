import { z } from "zod";
import { desc, audits, eq } from "@golive/db";
import { loadProject } from "@/server/access";
import { enqueueAudit, startAudit } from "@/server/audits";
import { readJson, route } from "@/server/http";
import { auditDto } from "@/server/projects";

export const runtime = "nodejs";

type P = { id: string };

export const GET = route<P>(async ({ params, as }) =>
  as(async (tx) => {
    await loadProject(tx, params.id);
    const rows = await tx.select().from(audits).where(eq(audits.projectId, params.id)).orderBy(desc(audits.createdAt)).limit(30);
    return rows.map(auditDto);
  }),
);

export const POST = route<P>(async ({ req, params, user, as }) => {
  const body = await readJson(req, z.object({ env: z.enum(["prod", "preprod"]), kind: z.enum(["quick", "full"]) }));
  const audit = await as((tx) => startAudit(tx, user.id, params.id, body.env, body.kind));
  await enqueueAudit(audit.id);
  return audit;
});
