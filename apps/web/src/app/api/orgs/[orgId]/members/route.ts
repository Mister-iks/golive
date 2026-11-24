import { route } from "@/server/http";
import { listMembers } from "@/server/orgs";

export const runtime = "nodejs";

export const GET = route<{ orgId: string }>(async ({ params, as }) => as((tx) => listMembers(tx, params.orgId)));
