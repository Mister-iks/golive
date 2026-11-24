import { validateSpec, type Spec } from "@golive/spec";
import type { TaskState } from "@golive/engine";
import {
  audits,
  desc,
  eq,
  evaluateProject,
  logActivity,
  projects,
  syncTasks,
  tasks,
  toTaskState,
  type Tx,
  type WebByEnv,
} from "@golive/db";
import { loadProject, type Rights } from "./access";
import { forbidden, HttpError, requireMfa } from "./http";

export interface AuditDto {
  id: string;
  env: "prod" | "preprod";
  kind: "quick" | "full";
  url: string;
  status: "queued" | "running" | "done" | "failed";
  progress: { step?: string; pages?: number; maxPages?: number };
  verdict: string | null;
  score: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ProjectDto {
  id: string;
  orgId: string;
  spec: Spec;
  revision: number;
  web: WebByEnv;
  tasks: TaskState[];
  rights: Rights;
  audits: AuditDto[];
  createdAt: string;
  updatedAt: string;
}

export function parseSpec(input: unknown): Spec {
  const r = validateSpec(input);
  if (!r.ok) throw new HttpError(400, `Spécification invalide : ${r.issues.slice(0, 3).map((i) => i.message).join(" ; ")}`, "invalid_spec");
  return r.spec;
}

export const auditDto = (a: typeof audits.$inferSelect): AuditDto => ({
  id: a.id,
  env: a.env,
  kind: a.kind,
  url: a.url,
  status: a.status,
  progress: a.progress,
  verdict: a.verdict,
  score: a.score,
  error: a.error,
  createdAt: a.createdAt.toISOString(),
  startedAt: a.startedAt?.toISOString() ?? null,
  finishedAt: a.finishedAt?.toISOString() ?? null,
});

export async function projectDto(tx: Tx, id: string): Promise<ProjectDto> {
  const { project, rights } = await loadProject(tx, id);
  const [taskRows, auditRows] = await Promise.all([
    tx.select().from(tasks).where(eq(tasks.projectId, id)),
    tx.select().from(audits).where(eq(audits.projectId, id)).orderBy(desc(audits.createdAt)).limit(10),
  ]);
  return {
    id: project.id,
    orgId: project.orgId,
    spec: project.spec,
    revision: project.revision,
    web: project.web ?? {},
    tasks: taskRows.map(toTaskState),
    rights,
    audits: auditRows.map(auditDto),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Saves a new version of the spec. Each part of the spec needs its own right:
 * waivers need a validator, evidence a contributor, everything else an editor.
 */
export async function saveSpec(tx: Tx, user: { id: string; twoFactorEnabled?: boolean | null }, id: string, input: unknown, revision: number) {
  const userId = user.id;
  const { project, rights } = await loadProject(tx, id);
  if (project.revision !== revision) throw new HttpError(409, "Le projet a été modifié par quelqu'un d'autre. Rechargez pour voir la dernière version.", "conflict");
  const spec = parseSpec(input);
  const prev = project.spec;

  const waiversChanged = !same(prev.waivers, spec.waivers);
  const evidenceChanged = !same(prev.evidence, spec.evidence);
  const rest = (s: Spec) => ({ ...s, waivers: undefined, evidence: undefined });
  const restChanged = !same(rest(prev), rest(spec));
  if (waiversChanged && !rights.validate) throw forbidden("Seuls les propriétaires et administrateurs signent ou retirent une dérogation.");
  if (waiversChanged) requireMfa(user);
  if (evidenceChanged && !rights.contribute) throw forbidden("Votre rôle ne permet pas d'attester une preuve.");
  if (restChanged && !rights.edit) throw forbidden("Votre rôle ne permet pas de modifier l'architecture.");
  if (!waiversChanged && !evidenceChanged && !restChanged) return { revision: project.revision, tasks: undefined };

  const [saved] = await tx
    .update(projects)
    .set({ spec, name: spec.project.name, revision: project.revision + 1, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  const report = evaluateProject({ spec, web: saved!.web });
  const taskList = await syncTasks(tx, saved!, report);

  const log = (action: string, meta: Record<string, unknown> = {}) =>
    logActivity(tx, { orgId: project.orgId, projectId: id, actorId: userId, action, target: spec.project.name, meta });
  if (waiversChanged) await log("waiver.changed", { waivers: (spec.waivers ?? []).map((w) => w.rule) });
  if (evidenceChanged) await log("evidence.changed", { rules: Object.keys(spec.evidence ?? {}) });
  if (restChanged) await log("spec.updated", { revision: saved!.revision });

  return { revision: saved!.revision, tasks: taskList };
}
