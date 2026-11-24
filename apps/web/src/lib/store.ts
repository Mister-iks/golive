"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TEMPLATES, validateSpec, type Spec } from "@golive/spec";
import type { Report } from "@golive/engine";
import type { WebObservation } from "@golive/packs-sdk";

export type Column = "todo" | "doing" | "review" | "done";

export interface Task {
  /** One task per rule. */
  id: string;
  column: Column;
  createdAt: string;
  updatedAt: string;
  /** Moved to "done" by hand while the audit still sees the problem. */
  unconfirmed?: boolean;
  /** Came back after being fixed. */
  regression?: boolean;
  closedByAudit?: boolean;
  assignee?: string;
}

export interface Project {
  id: string;
  spec: Spec;
  web?: WebObservation;
  tasks: Record<string, Task>;
  createdAt: string;
  updatedAt: string;
}

interface State {
  projects: Record<string, Project>;
  create: (from: { template?: string; spec?: Spec; name?: string }) => string;
  update: (id: string, fn: (spec: Spec) => Spec) => void;
  replaceSpec: (id: string, spec: Spec) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => string | undefined;
  setWeb: (id: string, web: WebObservation | undefined) => void;
  moveTask: (id: string, taskId: string, column: Column) => void;
  assignTask: (id: string, taskId: string, assignee: string) => void;
  syncTasks: (id: string, report: Report) => void;
}

const now = () => new Date().toISOString();
const newId = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      projects: {},

      create: ({ template, spec, name }) => {
        let s = spec;
        if (!s) {
          const t = TEMPLATES.find((x) => x.id === (template ?? "blank")) ?? TEMPLATES[0]!;
          const r = validateSpec(structuredClone(t.spec));
          if (!r.ok) throw new Error("template invalide");
          s = r.spec;
        }
        if (name) s = { ...s, project: { ...s.project, name } };
        const id = newId();
        const p: Project = { id, spec: s, tasks: {}, createdAt: now(), updatedAt: now() };
        set((st) => ({ projects: { ...st.projects, [id]: p } }));
        return id;
      },

      update: (id, fn) =>
        set((st) => {
          const p = st.projects[id];
          if (!p) return st;
          return { projects: { ...st.projects, [id]: { ...p, spec: fn(p.spec), updatedAt: now() } } };
        }),

      replaceSpec: (id, spec) => get().update(id, () => spec),

      remove: (id) =>
        set((st) => {
          const { [id]: _, ...rest } = st.projects;
          return { projects: rest };
        }),

      duplicate: (id) => {
        const p = get().projects[id];
        if (!p) return undefined;
        return get().create({ spec: { ...structuredClone(p.spec), project: { ...p.spec.project, name: `${p.spec.project.name} (copie)` } } });
      },

      setWeb: (id, web) =>
        set((st) => {
          const p = st.projects[id];
          if (!p) return st;
          return { projects: { ...st.projects, [id]: { ...p, web, updatedAt: now() } } };
        }),

      moveTask: (id, taskId, column) =>
        set((st) => {
          const p = st.projects[id];
          const t = p?.tasks[taskId];
          if (!p || !t || t.column === column) return st;
          const task: Task = {
            ...t,
            column,
            updatedAt: now(),
            // A task only becomes truly "done" when the audit confirms it.
            unconfirmed: column === "done" ? true : undefined,
            closedByAudit: undefined,
          };
          return { projects: { ...st.projects, [id]: { ...p, tasks: { ...p.tasks, [taskId]: task } } } };
        }),

      assignTask: (id, taskId, assignee) =>
        set((st) => {
          const p = st.projects[id];
          const t = p?.tasks[taskId];
          if (!p || !t) return st;
          return { projects: { ...st.projects, [id]: { ...p, tasks: { ...p.tasks, [taskId]: { ...t, assignee } } } } };
        }),

      syncTasks: (id, report) => {
        const p = get().projects[id];
        if (!p) return;
        const next = reconcile(p.tasks, report);
        if (next) set((st) => ({ projects: { ...st.projects, [id]: { ...p, tasks: next } } }));
      },
    }),
    {
      name: "golive.community.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/**
 * Tasks mirror the audit: one per open problem, never duplicated,
 * closed automatically when the audit sees the fix, reopened on regression.
 * Returns undefined when nothing changed.
 */
export function reconcile(tasks: Record<string, Task>, report: Report): Record<string, Task> | undefined {
  const open = new Set(
    report.results.filter((r) => r.status === "fail" || r.status === "evidence" || r.status === "warn").map((r) => r.ruleId),
  );
  const resolved = new Set(report.results.filter((r) => r.status === "pass").map((r) => r.ruleId));
  const out: Record<string, Task> = { ...tasks };
  let changed = false;
  const t = now();

  for (const ruleId of open) {
    const existing = out[ruleId];
    if (!existing) {
      out[ruleId] = { id: ruleId, column: "todo", createdAt: t, updatedAt: t };
      changed = true;
    } else if (existing.column === "done" && existing.closedByAudit) {
      out[ruleId] = { ...existing, column: "todo", regression: true, closedByAudit: undefined, updatedAt: t };
      changed = true;
    }
  }
  for (const [ruleId, task] of Object.entries(out)) {
    if (resolved.has(ruleId) && !(task.column === "done" && task.closedByAudit)) {
      out[ruleId] = { ...task, column: "done", closedByAudit: true, unconfirmed: undefined, regression: undefined, updatedAt: t };
      changed = true;
    } else if (!open.has(ruleId) && !resolved.has(ruleId) && task.column !== "done") {
      // Rule no longer applies (project changed): drop the task.
      delete out[ruleId];
      changed = true;
    }
  }
  return changed ? out : undefined;
}
