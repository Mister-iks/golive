import { z } from "zod";
import { orgRole, requireOrgAdmin } from "@/server/access";
import { readJson, requireMfa, route } from "@/server/http";
import { changeMemberRole, removeMember } from "@/server/orgs";

export const runtime = "nodejs";

type P = { orgId: string; userId: string };

export const PATCH = route<P>(async ({ req, params, user, as }) => {
  const { role } = await readJson(req, z.object({ role: z.enum(["owner", "admin", "member"]) }));
  await as(async (tx) => {
    requireOrgAdmin(await orgRole(tx, params.orgId));
    requireMfa(user);
    await changeMemberRole(tx, user.id, params.orgId, params.userId, role);
  });
});

export const DELETE = route<P>(async ({ params, user, as }) => {
  await as(async (tx) => {
    // Leaving is always possible; removing someone else is an administrator action.
    if (params.userId !== user.id) {
      requireOrgAdmin(await orgRole(tx, params.orgId));
      requireMfa(user);
    }
    await removeMember(tx, user.id, params.orgId, params.userId);
  });
});
