import { assertUrlAllowed } from "@golive/probe";
import { AUDIT_QUEUE, and, audits, eq, gt, logActivity, sql, type Tx } from "@golive/db";
import { loadProject } from "./access";
import { queue } from "./db";
import { isDomainVerified } from "./domains";
import { forbidden, HttpError } from "./http";
import { auditDto } from "./projects";

const MAX_PER_HOUR = Number(process.env.GOLIVE_AUDITS_PER_HOUR ?? 30);

export async function startAudit(tx: Tx, userId: string, projectId: string, env: "prod" | "preprod", kind: "quick" | "full") {
  const { project, rights } = await loadProject(tx, projectId);
  if (!rights.contribute) throw forbidden("Votre rôle ne permet pas de lancer un audit.");

  const target = project.spec.targets?.[env];
  if (!target) throw new HttpError(400, `Renseignez l'URL de ${env === "prod" ? "production" : "pré-production"} du projet.`, "no_target");
  const allowPrivate = process.env.GOLIVE_ALLOW_PRIVATE === "1";
  let url: URL;
  try {
    url = assertUrlAllowed(target, { allowPrivate });
  } catch (e) {
    throw new HttpError(400, (e as Error).message, "url_refused");
  }

  // The robot only browses a site in depth once the organization proved it controls the domain.
  if (kind === "full" && process.env.GOLIVE_SKIP_DOMAIN_VERIFICATION !== "1" && !(await isDomainVerified(tx, project.orgId, url.hostname))) {
    throw new HttpError(403, `Prouvez d'abord que vous contrôlez ${url.hostname} pour lancer un audit complet.`, "domain_unverified");
  }

  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(audits)
    .where(and(eq(audits.orgId, project.orgId), gt(audits.createdAt, sql`now() - interval '1 hour'`)));
  if (n >= MAX_PER_HOUR) throw new HttpError(429, "Trop d'audits lancés cette heure-ci. Réessayez plus tard.", "rate_limited");

  let row: typeof audits.$inferSelect;
  try {
    [row] = (await tx.insert(audits).values({ projectId, orgId: project.orgId, env, kind, url: url.toString(), requestedBy: userId }).returning()) as [typeof row];
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code) === "23505") throw new HttpError(409, "Un audit est déjà en cours pour cet environnement.", "audit_running");
    throw e;
  }
  await logActivity(tx, { orgId: project.orgId, projectId, actorId: userId, action: "audit.requested", target: url.toString(), meta: { kind, env } });
  return auditDto(row);
}

/** Queued after the transaction commits, so the worker always finds the row. */
export async function enqueueAudit(auditId: string) {
  const boss = await queue();
  await boss.send(AUDIT_QUEUE, { auditId }, { singletonKey: auditId });
}
