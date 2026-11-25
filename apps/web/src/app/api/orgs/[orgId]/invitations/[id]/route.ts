import { orgRole, requireOrgAdmin } from "@/server/access";
import { requireMfa, route } from "@/server/http";
import { resendInvitation, revokeInvitation } from "@/server/orgs";

export const runtime = "nodejs";

type P = { orgId: string; id: string };

/** Sends a fresh link (new token, new 7-day validity). */
export const POST = route<P>(async ({ params, user, lang, as }) =>
  as(async (tx) => {
    requireOrgAdmin(await orgRole(tx, params.orgId));
    requireMfa(user);
    return resendInvitation(tx, user, params.orgId, params.id, lang);
  }),
);

export const DELETE = route<P>(async ({ params, user, as }) => {
  await as(async (tx) => {
    requireOrgAdmin(await orgRole(tx, params.orgId));
    requireMfa(user);
    await revokeInvitation(tx, user.id, params.orgId, params.id);
  });
});
