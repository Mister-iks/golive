import { mailConfigured } from "@/server/mail";
import { route } from "@/server/http";
import { listOrgs } from "@/server/orgs";

export const runtime = "nodejs";

export const GET = route(async ({ user, as }) => ({
  user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: !!user.twoFactorEnabled },
  orgs: await as((tx) => listOrgs(tx, user.id)),
  settings: {
    mail: mailConfigured(),
    domainVerification: process.env.GOLIVE_SKIP_DOMAIN_VERIFICATION !== "1",
    maxPages: Number(process.env.GOLIVE_MAX_PAGES ?? 20),
  },
}));
