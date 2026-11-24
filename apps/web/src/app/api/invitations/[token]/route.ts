import { publicRoute, route } from "@/server/http";
import { acceptInvitation, previewInvitation } from "@/server/orgs";

export const runtime = "nodejs";

type P = { token: string };

export const GET = publicRoute<P>(async (_req, params) => previewInvitation(params.token));

export const POST = route<P>(async ({ params, user }) => acceptInvitation(user, params.token));
