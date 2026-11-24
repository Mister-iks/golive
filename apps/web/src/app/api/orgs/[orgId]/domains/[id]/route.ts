import { and, domainVerifications, eq, logActivity } from "@golive/db";
import { orgRole } from "@/server/access";
import { checkOwnership } from "@/server/domains";
import { forbidden, notFound, route } from "@/server/http";

export const runtime = "nodejs";

type P = { orgId: string; id: string };

/** Checks DNS or the well-known file now. */
export const POST = route<P>(async ({ params, user, as }) => {
  const row = await as(async (tx) => {
    if ((await orgRole(tx, params.orgId)) === "guest") throw forbidden();
    const [d] = await tx.select().from(domainVerifications).where(and(eq(domainVerifications.id, params.id), eq(domainVerifications.orgId, params.orgId)));
    if (!d) throw notFound("Domaine introuvable.");
    return d;
  });
  const result = await checkOwnership(row.hostname, row.token);
  return as(async (tx) => {
    const [d] = await tx
      .update(domainVerifications)
      .set(result.ok ? { verifiedAt: row.verifiedAt ?? new Date(), method: result.method, checkedAt: new Date() } : { checkedAt: new Date() })
      .where(eq(domainVerifications.id, row.id))
      .returning();
    if (result.ok && !row.verifiedAt) await logActivity(tx, { orgId: params.orgId, actorId: user.id, action: "domain.verified", target: row.hostname, meta: { method: result.method } });
    return { domain: d, ...result };
  });
});

export const DELETE = route<P>(async ({ params, user, as }) =>
  as(async (tx) => {
    if ((await orgRole(tx, params.orgId)) === "guest") throw forbidden();
    const [d] = await tx.delete(domainVerifications).where(and(eq(domainVerifications.id, params.id), eq(domainVerifications.orgId, params.orgId))).returning();
    if (!d) throw notFound("Domaine introuvable.");
    await logActivity(tx, { orgId: params.orgId, actorId: user.id, action: "domain.removed", target: d.hostname });
  }),
);
