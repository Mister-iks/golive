import { z } from "zod";
import { readJson, requireMfa, route } from "@/server/http";
import { changeMemberRole, removeMember } from "@/server/orgs";

export const runtime = "nodejs";

type P = { orgId: string; userId: string };

export const PATCH = route<P>(async ({ req, params, user, as }) => {
  const { role } = await readJson(req, z.object({ role: z.enum(["owner", "admin", "member", "guest"]) }));
  requireMfa(user);
  await as((tx) => changeMemberRole(tx, user.id, params.orgId, params.userId, role));
});

export const DELETE = route<P>(async ({ params, user, as }) => {
  // Leaving is always possible; removing someone else is an administrator action.
  if (params.userId !== user.id) requireMfa(user);
  await as((tx) => removeMember(tx, user.id, params.orgId, params.userId));
});
