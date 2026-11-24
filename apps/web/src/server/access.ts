import { eq, projects, sql, type OrgRole, type ProjectRole, type Tx } from "@golive/db";
import { forbidden, notFound } from "./http";

export interface Rights {
  role: ProjectRole;
  orgRole: OrgRole | null;
  /** Change the architecture and the project sheet. */
  edit: boolean;
  /** Move tasks, attach evidence, launch audits. */
  contribute: boolean;
  /** Sign waivers and pronounce the Go. Organization owners and admins, or a project Valideur. */
  validate: boolean;
  /** Share the project, change roles, delete it. */
  manage: boolean;
}

export function rightsFor(role: ProjectRole, orgRole: OrgRole | null): Rights {
  const admin = orgRole === "owner" || orgRole === "admin";
  return {
    role,
    orgRole,
    edit: role === "responsable" || role === "editeur",
    contribute: role !== "lecteur",
    validate: role === "valideur" || admin,
    manage: role === "responsable",
  };
}

/** Loads a project visible to the current user (RLS) with the user's effective rights. */
export async function loadProject(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      project: projects,
      role: sql<ProjectRole | null>`golive.project_role(${projects.id})`,
      orgRole: sql<OrgRole | null>`golive.org_role(${projects.orgId})`,
    })
    .from(projects)
    .where(eq(projects.id, id));
  if (!row || !row.role) throw notFound("Projet introuvable ou accès retiré.");
  return { project: row.project, rights: rightsFor(row.role, row.orgRole) };
}

export async function orgRole(tx: Tx, orgId: string): Promise<OrgRole> {
  const r = await tx.execute<{ role: OrgRole | null }>(sql`select golive.org_role(${orgId}) as role`);
  const role = r[0]?.role;
  if (!role) throw notFound("Organisation introuvable.");
  return role;
}

export function requireOrgAdmin(role: OrgRole) {
  if (role !== "owner" && role !== "admin") throw forbidden("Réservé aux propriétaires et administrateurs de l'organisation.");
}
