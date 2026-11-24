import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  eq,
  gt,
  invitations,
  isNull,
  logActivity,
  orgMembers,
  organizations,
  projectMembers,
  sql,
  users,
  type OrgRole,
  type Tx,
} from "@golive/db";
import { orgRole, requireOrgAdmin } from "./access";
import { APP_URL } from "./auth";
import { db } from "./db";
import { forbidden, HttpError, notFound } from "./http";
import { sendMail } from "./mail";

export const INVITE_DAYS = 7;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function listOrgs(tx: Tx, userId: string) {
  return tx
    .select({ id: organizations.id, name: organizations.name, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(organizations.createdAt));
}

export async function listMembers(tx: Tx, orgId: string) {
  const role = await orgRole(tx, orgId);
  const members = await tx
    .select({ userId: users.id, name: users.name, email: users.email, role: orgMembers.role, twoFactor: users.twoFactorEnabled, since: orgMembers.createdAt })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(asc(orgMembers.createdAt));
  const pending =
    role === "owner" || role === "admin"
      ? await tx
          .select({
            id: invitations.id,
            email: invitations.email,
            orgRole: invitations.orgRole,
            expiresAt: invitations.expiresAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .where(and(eq(invitations.orgId, orgId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      : [];
  return { role, members, invitations: pending.map((p) => ({ ...p, expired: p.expiresAt < new Date() })) };
}

export async function changeMemberRole(tx: Tx, actorId: string, orgId: string, userId: string, role: OrgRole) {
  const mine = await orgRole(tx, orgId);
  requireOrgAdmin(mine);
  const [target] = await tx.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  if (!target) throw notFound("Membre introuvable.");
  if ((target.role === "owner" || role === "owner") && mine !== "owner") throw forbidden("Seul un propriétaire peut nommer ou retirer un propriétaire.");
  if (target.role === "owner" && role !== "owner") await assertAnotherOwner(tx, orgId, userId);
  await tx.update(orgMembers).set({ role }).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  await logActivity(tx, { orgId, actorId, action: "member.role", target: userId, meta: { from: target.role, to: role } });
}

export async function removeMember(tx: Tx, actorId: string, orgId: string, userId: string) {
  const mine = await orgRole(tx, orgId);
  if (userId !== actorId) requireOrgAdmin(mine);
  const [target] = await tx.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  if (!target) throw notFound("Membre introuvable.");
  if (target.role === "owner") {
    if (mine !== "owner") throw forbidden("Seul un propriétaire peut retirer un propriétaire.");
    await assertAnotherOwner(tx, orgId, userId);
  }
  // Leaving happens as the database owner: once the membership row is gone, RLS would hide the rest.
  await db().transaction(async (sys) => {
    await sys.delete(projectMembers).where(and(eq(projectMembers.orgId, orgId), eq(projectMembers.userId, userId)));
    await sys.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
    await logActivity(sys, { orgId, actorId, action: userId === actorId ? "member.left" : "member.removed", target: userId });
  });
}

async function assertAnotherOwner(tx: Tx, orgId: string, userId: string) {
  const owners = await tx.select({ id: orgMembers.userId }).from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "owner")));
  if (!owners.some((o) => o.id !== userId)) throw new HttpError(400, "L'organisation doit garder au moins un propriétaire.");
}

/* ------------------------------------------------------------ invitations */

export interface InviteInput {
  email: string;
  orgRole: "admin" | "member";
}

export async function invite(tx: Tx, actor: { id: string; name: string }, orgId: string, input: InviteInput) {
  requireOrgAdmin(await orgRole(tx, orgId));
  const email = input.email.trim().toLowerCase();
  const already = await tx
    .select({ id: users.id })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, orgId), eq(sql`lower(${users.email})`, email)));
  if (already.length) throw new HttpError(409, "Cette personne fait déjà partie de l'organisation.");

  // A new invitation to the same address replaces the previous one.
  await tx
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.orgId, orgId), eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));

  const token = randomBytes(32).toString("base64url");
  const [inv] = await tx
    .insert(invitations)
    .values({
      orgId,
      email,
      orgRole: input.orgRole,
      tokenHash: hash(token),
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    })
    .returning();
  await logActivity(tx, { orgId, actorId: actor.id, action: "invitation.sent", target: email, meta: { orgRole: input.orgRole } });
  const link = `${APP_URL}/invite/${token}`;
  const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  const mail = await sendMail(
    email,
    `${actor.name} vous invite sur PcyBox GoLive`,
    `Bonjour,\n\n${actor.name} vous invite à rejoindre « ${org?.name} » sur PcyBox GoLive.\n\nAcceptez l'invitation avec ce lien, valable ${INVITE_DAYS} jours :\n${link}\n\nSi vous ne connaissez pas l'expéditeur, ignorez ce message.`,
  );
  return { id: inv!.id, link, emailSent: mail.sent };
}

export async function revokeInvitation(tx: Tx, actorId: string, orgId: string, id: string) {
  requireOrgAdmin(await orgRole(tx, orgId));
  const [inv] = await tx
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.orgId, orgId), isNull(invitations.acceptedAt)))
    .returning();
  if (!inv) throw notFound("Invitation introuvable.");
  await logActivity(tx, { orgId, actorId, action: "invitation.revoked", target: inv.email });
}

export async function resendInvitation(tx: Tx, actor: { id: string; name: string }, orgId: string, id: string) {
  const [inv] = await tx.select().from(invitations).where(and(eq(invitations.id, id), eq(invitations.orgId, orgId)));
  if (!inv || inv.acceptedAt) throw notFound("Invitation introuvable.");
  return invite(tx, actor, orgId, { email: inv.email, orgRole: inv.orgRole === "admin" ? "admin" : "member" });
}

/** Public preview: only what the invitee needs to decide. Runs without a session. */
export async function previewInvitation(token: string) {
  const [row] = await db()
    .select({ inv: invitations, org: organizations.name, inviter: users.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.tokenHash, hash(token)));
  if (!row || row.inv.revokedAt) throw notFound("Invitation introuvable ou annulée.");
  return {
    org: row.org,
    inviter: row.inviter,
    email: row.inv.email,
    accepted: !!row.inv.acceptedAt,
    expired: row.inv.expiresAt < new Date(),
  };
}

/**
 * Accepting runs as the database owner: the invitee is not yet a member, so RLS
 * would hide everything. The token and the e-mail match are the authorization.
 */
export async function acceptInvitation(user: { id: string; email: string }, token: string) {
  return db().transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, hash(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
      .for("update");
    if (!inv) throw new HttpError(410, "Invitation expirée, annulée ou déjà utilisée. Demandez-en une nouvelle.");
    if (inv.email !== user.email.toLowerCase()) throw forbidden(`Cette invitation est destinée à ${inv.email}. Connectez-vous avec cette adresse.`);

    const [existing] = await tx.select().from(orgMembers).where(and(eq(orgMembers.orgId, inv.orgId), eq(orgMembers.userId, user.id)));
    if (!existing) await tx.insert(orgMembers).values({ orgId: inv.orgId, userId: user.id, role: inv.orgRole });
    await tx.update(invitations).set({ acceptedAt: new Date(), acceptedBy: user.id }).where(eq(invitations.id, inv.id));
    await logActivity(tx, { orgId: inv.orgId, actorId: user.id, action: "invitation.accepted", target: inv.email });
    return { orgId: inv.orgId };
  });
}
