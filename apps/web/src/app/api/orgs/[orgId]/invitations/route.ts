import { z } from "zod";
import { readJson, route } from "@/server/http";
import { invite } from "@/server/orgs";

export const runtime = "nodejs";

const PROJECT_ROLES = ["responsable", "editeur", "contributeur", "lecteur", "valideur"] as const;

export const POST = route<{ orgId: string }>(async ({ req, params, user, as }) => {
  const input = await readJson(
    req,
    z.object({
      email: z.email(),
      orgRole: z.enum(["admin", "member", "guest"]),
      projects: z.array(z.object({ projectId: z.string().min(1), role: z.enum(PROJECT_ROLES) })).max(50).default([]),
      accessExpiresAt: z.iso.date().nullish(),
    }),
  );
  return as((tx) => invite(tx, user, params.orgId, input));
});
