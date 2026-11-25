import { z } from "zod";
import { orgRole, requireOrgAdmin } from "@/server/access";
import { readJson, requireMfa, route } from "@/server/http";
import { invite } from "@/server/orgs";

export const runtime = "nodejs";

export const POST = route<{ orgId: string }>(async ({ req, params, user, lang, as }) => {
  const input = await readJson(
    req,
    z.object({
      email: z.email(),
      orgRole: z.enum(["admin", "member"]),
    }),
  );
  return as(async (tx) => {
    requireOrgAdmin(await orgRole(tx, params.orgId));
    requireMfa(user);
    return invite(tx, user, params.orgId, input, lang);
  });
});
