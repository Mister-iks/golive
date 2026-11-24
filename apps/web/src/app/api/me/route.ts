import { eq, projectMembers } from "@golive/db";
import { mailConfigured } from "@/server/mail";
import { mfaEnforced, route } from "@/server/http";
import { listOrgs } from "@/server/orgs";

export const runtime = "nodejs";

export const GET = route(async ({ user, as }) => {
  const { orgs, validator } = await as(async (tx) => ({
    orgs: await listOrgs(tx, user.id),
    validator: (await tx.select({ role: projectMembers.role }).from(projectMembers).where(eq(projectMembers.userId, user.id))).some((m) => m.role === "valideur"),
  }));
  const sensitive = validator || orgs.some((o) => o.role === "owner" || o.role === "admin");
  return {
  user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: !!user.twoFactorEnabled },
  orgs,
  mfaRequired: mfaEnforced() && sensitive && !user.twoFactorEnabled,
  settings: {
    mail: mailConfigured(),
    domainVerification: process.env.GOLIVE_SKIP_DOMAIN_VERIFICATION !== "1",
    maxPages: Number(process.env.GOLIVE_MAX_PAGES ?? 20),
  },
  };
});
