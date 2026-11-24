"use client";

import { create } from "zustand";
import { TEMPLATES, validateSpec, type Spec } from "@golive/spec";
import type { Decision, TaskColumn, TaskState } from "@golive/engine";
import type { WebObservation } from "@golive/packs-sdk";
import { api, ApiError } from "./api";

export type Column = TaskColumn;
export type Task = TaskState;
export type OrgRole = "owner" | "admin" | "member" | "guest";
export type ProjectRole = "responsable" | "editeur" | "contributeur" | "lecteur" | "valideur";

export interface Rights {
  role: ProjectRole;
  orgRole: OrgRole | null;
  edit: boolean;
  contribute: boolean;
  validate: boolean;
  manage: boolean;
}

export interface Audit {
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

export type WebByEnv = Partial<Record<"prod" | "preprod", WebObservation>>;

export interface Project {
  id: string;
  orgId: string;
  spec: Spec;
  revision: number;
  webByEnv: WebByEnv;
  /** Observation the verdict is computed from: the most recent one. */
  web?: WebObservation;
  tasks: Record<string, Task>;
  rights: Rights;
  audits: Audit[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  spec: Spec;
  role: ProjectRole | null;
  createdAt: string;
  updatedAt: string;
  summary: { score: number; threshold: number; decision: Decision; blocking: number; audited: boolean };
}

export interface Me {
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  orgs: { id: string; name: string; role: OrgRole }[];
  settings: { mail: boolean; domainVerification: boolean; maxPages: number };
}

export interface Notice {
  id: number;
  tone: "error" | "info";
  text: string;
}

interface ProjectDto {
  id: string;
  orgId: string;
  spec: Spec;
  revision: number;
  web: WebByEnv;
  tasks: Task[];
  rights: Rights;
  audits: Audit[];
  createdAt: string;
  updatedAt: string;
}

interface State {
  me?: Me;
  orgId?: string;
  list?: ProjectSummary[];
  projects: Record<string, Project>;
  /** Projects with changes not yet confirmed by the server. */
  saving: Record<string, boolean>;
  notice?: Notice;

  loadMe: () => Promise<Me>;
  setOrg: (orgId: string) => void;
  loadList: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  create: (from: { template?: string; spec?: Spec; name?: string }) => Promise<string>;
  update: (id: string, fn: (spec: Spec) => Spec) => void;
  replaceSpec: (id: string, spec: Spec) => void;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string, spec?: Spec) => Promise<string | undefined>;
  startAudit: (id: string, env: "prod" | "preprod", kind: "quick" | "full") => Promise<Audit>;
  clearWeb: (id: string, env: "prod" | "preprod") => Promise<void>;
  moveTask: (id: string, taskId: string, column: Column) => void;
  assignTask: (id: string, taskId: string, assignee: string) => void;
  notify: (text: string, tone?: Notice["tone"]) => void;
}

const ORG_KEY = "golive.org";
const now = () => new Date().toISOString();

export const latestWeb = (web: WebByEnv): WebObservation | undefined =>
  Object.values(web)
    .filter((w): w is WebObservation => !!w)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];

const fromDto = (d: ProjectDto): Project => ({
  id: d.id,
  orgId: d.orgId,
  spec: d.spec,
  revision: d.revision,
  webByEnv: d.web,
  web: latestWeb(d.web),
  tasks: Object.fromEntries(d.tasks.map((t) => [t.id, t])),
  rights: d.rights,
  audits: d.audits,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/* Spec saves are debounced and serialized per project. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

export const useStore = create<State>()((set, get) => {
  const patch = (id: string, fn: (p: Project) => Project) =>
    set((st) => {
      const p = st.projects[id];
      return p ? { projects: { ...st.projects, [id]: fn(p) } } : st;
    });

  const flush = async (id: string) => {
    await inflight.get(id);
    const p = get().projects[id];
    if (!p) return;
    const spec = p.spec;
    const run = (async () => {
      try {
        const r = await api<{ revision: number; tasks?: Task[] }>(`/projects/${id}`, { method: "PUT", body: { spec, revision: p.revision } });
        patch(id, (cur) => ({
          ...cur,
          revision: r.revision,
          tasks: r.tasks ? Object.fromEntries(r.tasks.map((t) => [t.id, t])) : cur.tasks,
        }));
      } catch (e) {
        const err = e as ApiError;
        get().notify(err.message);
        // The server state wins: reload it (conflict, missing right, invalid spec).
        if (err.status === 409 || err.status === 403 || err.status === 400) await get().loadProject(id).catch(() => {});
      }
    })();
    inflight.set(id, run);
    await run;
    inflight.delete(id);
    if (!timers.has(id)) set((st) => ({ saving: { ...st.saving, [id]: false } }));
  };

  const schedule = (id: string) => {
    clearTimeout(timers.get(id));
    set((st) => ({ saving: { ...st.saving, [id]: true } }));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void flush(id);
      }, 600),
    );
  };

  return {
    projects: {},
    saving: {},

    loadMe: async () => {
      const me = await api<Me>("/me");
      let orgId = get().orgId;
      try {
        orgId ??= localStorage.getItem(ORG_KEY) ?? undefined;
      } catch {}
      if (!me.orgs.some((o) => o.id === orgId)) orgId = me.orgs[0]?.id;
      set({ me, orgId });
      return me;
    },

    setOrg: (orgId) => {
      try {
        localStorage.setItem(ORG_KEY, orgId);
      } catch {}
      set({ orgId, list: undefined });
      void get().loadList();
    },

    loadList: async () => {
      const orgId = get().orgId;
      if (!orgId) return set({ list: [] });
      const list = await api<ProjectSummary[]>(`/orgs/${orgId}/projects`);
      if (get().orgId === orgId) set({ list });
    },

    loadProject: async (id) => {
      const dto = await api<ProjectDto>(`/projects/${id}`);
      set((st) => ({ projects: { ...st.projects, [id]: fromDto(dto) } }));
      // Opening a project of another organization switches to it.
      if (get().orgId !== dto.orgId && get().me?.orgs.some((o) => o.id === dto.orgId)) {
        try {
          localStorage.setItem(ORG_KEY, dto.orgId);
        } catch {}
        set({ orgId: dto.orgId, list: undefined });
      }
    },

    create: async ({ template, spec, name }) => {
      let s = spec;
      if (!s) {
        const t = TEMPLATES.find((x) => x.id === (template ?? "blank")) ?? TEMPLATES[0]!;
        const r = validateSpec(structuredClone(t.spec));
        if (!r.ok) throw new Error("modèle invalide");
        s = r.spec;
      }
      if (name) s = { ...s, project: { ...s.project, name } };
      const orgId = get().orgId;
      if (!orgId) throw new Error("Aucune organisation.");
      const { id } = await api<{ id: string }>(`/orgs/${orgId}/projects`, { body: { spec: s } });
      void get().loadList();
      return id;
    },

    update: (id, fn) => {
      const p = get().projects[id];
      if (!p) return;
      const spec = fn(p.spec);
      if (spec === p.spec) return;
      patch(id, (cur) => ({ ...cur, spec, updatedAt: now() }));
      schedule(id);
    },

    replaceSpec: (id, spec) => get().update(id, () => spec),

    remove: async (id) => {
      await api(`/projects/${id}`, { method: "DELETE" });
      set((st) => {
        const { [id]: _, ...rest } = st.projects;
        return { projects: rest, list: st.list?.filter((p) => p.id !== id) };
      });
    },

    duplicate: async (id, specIn) => {
      const spec = specIn ?? get().projects[id]?.spec ?? get().list?.find((p) => p.id === id)?.spec;
      if (!spec) return undefined;
      return get().create({ spec: { ...structuredClone(spec), project: { ...spec.project, name: `${spec.project.name} (copie)` } } });
    },

    startAudit: async (id, env, kind) => {
      // Pending spec edits (the URL itself, often) must reach the server first.
      if (timers.has(id)) {
        clearTimeout(timers.get(id));
        timers.delete(id);
        await flush(id);
      }
      await inflight.get(id);
      const audit = await api<Audit>(`/projects/${id}/audits`, { body: { env, kind } });
      patch(id, (p) => ({ ...p, audits: [audit, ...p.audits] }));
      return audit;
    },

    clearWeb: async (id, env) => {
      const r = await api<{ tasks: Task[] }>(`/projects/${id}/web/${env}`, { method: "DELETE" });
      patch(id, (p) => {
        const webByEnv = { ...p.webByEnv };
        delete webByEnv[env];
        return { ...p, webByEnv, web: latestWeb(webByEnv), tasks: Object.fromEntries(r.tasks.map((t) => [t.id, t])) };
      });
    },

    moveTask: (id, taskId, column) => {
      const t = get().projects[id]?.tasks[taskId];
      if (!t || t.column === column) return;
      patch(id, (p) => ({
        ...p,
        tasks: { ...p.tasks, [taskId]: { ...t, column, updatedAt: now(), unconfirmed: column === "done" ? true : undefined, closedByAudit: undefined } },
      }));
      api(`/projects/${id}/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: { column } }).catch((e: Error) => {
        get().notify(e.message);
        void get().loadProject(id);
      });
    },

    assignTask: (id, taskId, assignee) => {
      const t = get().projects[id]?.tasks[taskId];
      if (!t) return;
      patch(id, (p) => ({ ...p, tasks: { ...p.tasks, [taskId]: { ...t, assignee: assignee || undefined } } }));
      api(`/projects/${id}/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: { assignee: assignee || null } }).catch((e: Error) => get().notify(e.message));
    },

    notify: (text, tone = "error") => set({ notice: { id: Date.now(), tone, text } }),
  };
});
