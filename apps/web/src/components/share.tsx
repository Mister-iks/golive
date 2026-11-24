"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useStore, type OrgRole, type Project, type ProjectRole, type Rights } from "@/lib/store";
import { ORG_ROLE_LABEL } from "./account";
import { Button, Dialog, Select } from "./ui";

export const PROJECT_ROLES: { id: ProjectRole; label: string; hint: string }[] = [
  { id: "responsable", label: "Responsable", hint: "Tout, y compris partager et supprimer le projet." },
  { id: "editeur", label: "Éditeur", hint: "Modifie l'architecture et la fiche, lance les audits." },
  { id: "contributeur", label: "Contributeur", hint: "Avance les tâches, joint des preuves, lance les audits." },
  { id: "valideur", label: "Valideur", hint: "Signe les dérogations et prononce le Go." },
  { id: "lecteur", label: "Lecteur", hint: "Consulte le projet et le rapport." },
];
export const PROJECT_ROLE_LABEL = Object.fromEntries(PROJECT_ROLES.map((r) => [r.id, r.label])) as Record<ProjectRole, string>;

interface Members {
  rights: Rights;
  members: { userId: string; name: string; email: string; role: ProjectRole; expiresAt: string | null }[];
  org: { userId: string; name: string; email: string; orgRole: OrgRole }[];
}

export function ShareDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<Members>();
  const [adding, setAdding] = useState({ userId: "", role: "editeur" as ProjectRole });
  const notify = useStore((s) => s.notify);

  const load = () =>
    api<Members>(`/projects/${project.id}/members`)
      .then(setData)
      .catch((e: Error) => notify(e.message));
  useEffect(() => {
    if (open) void load();
  }, [open]);

  const setRole = async (userId: string, role: ProjectRole) => {
    try {
      await api(`/projects/${project.id}/members`, { method: "PUT", body: { userId, role } });
      await load();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const removeUser = async (userId: string) => {
    try {
      await api(`/projects/${project.id}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const manage = data?.rights.manage;
  const explicit = new Set(data?.members.map((m) => m.userId));
  const implicit = data?.org.filter((m) => !explicit.has(m.userId) && (m.orgRole === "owner" || m.orgRole === "admin" || m.orgRole === "member")) ?? [];
  const candidates = data?.org.filter((m) => !explicit.has(m.userId)) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Accès au projet" description={project.spec.project.name} width={600}>
      {!data ? (
        <div className="h-40" />
      ) : (
        <div className="flex flex-col">
          <ul className="divide-y divide-line">
            {data.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-5 py-2.5">
                <Person name={m.name} email={m.email} />
                {m.expiresAt && <span className="text-[11px] text-fg-3">jusqu'au {new Date(m.expiresAt).toLocaleDateString("fr-FR")}</span>}
                <div className="w-[150px]">
                  <Select value={m.role} disabled={!manage} onChange={(e) => void setRole(m.userId, e.target.value as ProjectRole)} aria-label={`Rôle de ${m.name}`}>
                    {PROJECT_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {manage && (
                  <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} aria-label={`Retirer ${m.name}`} onClick={() => void removeUser(m.userId)} />
                )}
              </li>
            ))}
            {implicit.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-5 py-2.5">
                <Person name={m.name} email={m.email} />
                <span className="text-xs text-fg-3">
                  {ORG_ROLE_LABEL[m.orgRole]} de l'organisation · {m.orgRole === "member" ? "Lecteur" : "Responsable"}
                </span>
              </li>
            ))}
          </ul>
          {manage && (
            <form
              className="flex items-end gap-2 border-t border-line bg-surface-2 px-5 py-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (adding.userId) void setRole(adding.userId, adding.role).then(() => setAdding((a) => ({ ...a, userId: "" })));
              }}
            >
              <div className="flex-1">
                <Select value={adding.userId} onChange={(e) => setAdding((a) => ({ ...a, userId: e.target.value }))} aria-label="Membre à ajouter">
                  <option value="">Donner un rôle à un membre de l'organisation…</option>
                  {candidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-[150px]">
                <Select value={adding.role} onChange={(e) => setAdding((a) => ({ ...a, role: e.target.value as ProjectRole }))} aria-label="Rôle">
                  {PROJECT_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="primary" disabled={!adding.userId}>
                Ajouter
              </Button>
            </form>
          )}
          <p className="border-t border-line px-5 py-3 text-xs text-fg-3">
            Quelqu'un d'extérieur ? <Link href="/settings?tab=members" className="text-fg underline underline-offset-2">Invitez-le par e-mail</Link> avec un accès limité à ce projet.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Person({ name, email }: { name: string; email: string }) {
  return (
    <div className="min-w-0 flex-1 leading-tight">
      <p className="truncate text-[13px] font-medium">{name}</p>
      <p className="truncate text-xs text-fg-3">{email}</p>
    </div>
  );
}
