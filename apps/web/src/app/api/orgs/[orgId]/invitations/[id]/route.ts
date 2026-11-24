import { route } from "@/server/http";
import { resendInvitation, revokeInvitation } from "@/server/orgs";

export const runtime = "nodejs";

type P = { orgId: string; id: string };

/** Sends a fresh link (new token, new 7-day validity). */
export const POST = route<P>(async ({ params, user, as }) => as((tx) => resendInvitation(tx, user, params.orgId, params.id)));

export const DELETE = route<P>(async ({ params, user, as }) => {
  await as((tx) => revokeInvitation(tx, user.id, params.orgId, params.id));
});
