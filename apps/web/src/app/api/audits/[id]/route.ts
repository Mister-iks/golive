import { audits, eq } from "@golive/db";
import { L, notFound, route } from "@/server/http";
import { auditDto } from "@/server/projects";

export const runtime = "nodejs";

/** Polled by the interface while an audit runs. */
export const GET = route<{ id: string }>(async ({ params, as }) =>
  as(async (tx) => {
    const [a] = await tx.select().from(audits).where(eq(audits.id, params.id));
    if (!a) throw notFound(L("Audit not found.", "Audit introuvable."));
    return auditDto(a);
  }),
);
