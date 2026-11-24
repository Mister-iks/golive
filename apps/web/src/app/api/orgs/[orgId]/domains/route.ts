import { z } from "zod";
import { and, asc, domainVerifications, eq, logActivity } from "@golive/db";
import { orgRole } from "@/server/access";
import { DNS_PREFIX, DOMAIN_FILE, newToken, normalizeHost } from "@/server/domains";
import { forbidden, HttpError, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const GET = route<{ orgId: string }>(async ({ params, as }) =>
  as(async (tx) => {
    await orgRole(tx, params.orgId);
    const rows = await tx.select().from(domainVerifications).where(eq(domainVerifications.orgId, params.orgId)).orderBy(asc(domainVerifications.createdAt));
    return { dnsPrefix: DNS_PREFIX, file: DOMAIN_FILE, domains: rows };
  }),
);

export const POST = route<{ orgId: string }>(async ({ req, params, user, as }) => {
  const body = await readJson(req, z.object({ hostname: z.string().min(3).max(253) }));
  let hostname: string;
  try {
    hostname = normalizeHost(body.hostname);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return as(async (tx) => {
    if ((await orgRole(tx, params.orgId)) === "guest") throw forbidden();
    const [existing] = await tx
      .select()
      .from(domainVerifications)
      .where(and(eq(domainVerifications.orgId, params.orgId), eq(domainVerifications.hostname, hostname)));
    if (existing) return existing;
    const [row] = await tx.insert(domainVerifications).values({ orgId: params.orgId, hostname, token: newToken(), createdBy: user.id }).returning();
    await logActivity(tx, { orgId: params.orgId, actorId: user.id, action: "domain.added", target: hostname });
    return row;
  });
});
