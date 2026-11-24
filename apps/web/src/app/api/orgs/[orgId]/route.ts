import { z } from "zod";
import { eq, logActivity, organizations } from "@golive/db";
import { orgRole, requireOrgAdmin } from "@/server/access";
import { readJson, requireMfa, route } from "@/server/http";

export const runtime = "nodejs";

export const PATCH = route<{ orgId: string }>(async ({ req, params, user, as }) => {
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(1).max(120) }));
  return as(async (tx) => {
    requireOrgAdmin(await orgRole(tx, params.orgId));
    requireMfa(user);
    await tx.update(organizations).set({ name }).where(eq(organizations.id, params.orgId));
    await logActivity(tx, { orgId: params.orgId, actorId: user.id, action: "org.renamed", target: name });
    return { ok: true };
  });
});
