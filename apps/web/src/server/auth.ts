import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { accounts, and, eq, gt, invitations, isNull, logActivity, orgMembers, organizations, sessions, sql, twoFactors, users, verifications } from "@golive/db";
import { db } from "./db";
import { sendMail } from "./mail";

export const APP_URL = process.env.GOLIVE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "PcyBox GoLive",
  baseURL: APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db(), {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, twoFactor: twoFactors },
  }),
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  telemetry: { enabled: false },
  rateLimit: { enabled: true, window: 60, max: 60 },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(user.email, "Réinitialiser votre mot de passe PcyBox GoLive", `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 10,
      sendMagicLink: async ({ email, url }) => {
        // A magic link would bypass the second factor: accounts with 2FA sign in with password and code.
        const [u] = await db().select({ twoFactor: users.twoFactorEnabled }).from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase()));
        if (u?.twoFactor) return;
        await sendMail(email, "Votre lien de connexion PcyBox GoLive", `Bonjour,\n\nPour vous connecter, ouvrez ce lien (valable 10 minutes) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
      },
    }),
    twoFactor({ issuer: "PcyBox GoLive" }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if ((process.env.GOLIVE_SIGNUP ?? "open") !== "invite") return;
          // Invite-only: the first account is the administrator, later ones need a pending invitation.
          const [{ count } = { count: 0 }] = await db().select({ count: sql<number>`count(*)::int` }).from(users);
          if (count === 0) return;
          const [inv] = await db()
            .select({ id: invitations.id })
            .from(invitations)
            .where(and(eq(sql`lower(${invitations.email})`, user.email.toLowerCase()), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())));
          if (!inv) throw new APIError("FORBIDDEN", { message: "Les inscriptions se font sur invitation." });
        },
        after: async (user) => {
          // Every account starts with its own organization.
          await db().transaction(async (tx) => {
            const [org] = await tx.insert(organizations).values({ name: `Espace de ${user.name.split(" ")[0] || user.name}` }).returning();
            await tx.insert(orgMembers).values({ orgId: org!.id, userId: user.id, role: "owner" });
            await logActivity(tx, { orgId: org!.id, actorId: user.id, action: "org.created", target: org!.name });
          });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          const orgs = await db().select({ orgId: orgMembers.orgId }).from(orgMembers).where(eq(orgMembers.userId, session.userId));
          for (const o of orgs) await logActivity(db(), { orgId: o.orgId, actorId: session.userId, action: "auth.login", meta: { ip: session.ipAddress ?? null } });
        },
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
