import { z } from "zod";
import { readJson, route } from "@/server/http";
import { createOrg } from "@/server/orgs";

export const runtime = "nodejs";

export const POST = route(async ({ req, user, as }) => {
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(1).max(120) }));
  return as((tx) => createOrg(tx, user.id, name));
});
