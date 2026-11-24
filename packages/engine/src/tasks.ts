import type { Report } from "./index";

export type TaskColumn = "todo" | "doing" | "review" | "done";

export interface TaskState {
  /** One task per rule. */
  id: string;
  column: TaskColumn;
  createdAt: string;
  updatedAt: string;
  /** Moved to "done" by hand while the audit still sees the problem. */
  unconfirmed?: boolean;
  /** Came back after being fixed. */
  regression?: boolean;
  closedByAudit?: boolean;
  assignee?: string;
}

/**
 * Tasks mirror the evaluation: one per open problem, never duplicated,
 * closed automatically when the audit sees the fix, reopened on regression.
 * Returns undefined when nothing changed.
 */
export function reconcileTasks(tasks: Record<string, TaskState>, report: Report, now = new Date().toISOString()): Record<string, TaskState> | undefined {
  const open = new Set(report.results.filter((r) => r.status === "fail" || r.status === "evidence" || r.status === "warn").map((r) => r.ruleId));
  const resolved = new Set(report.results.filter((r) => r.status === "pass").map((r) => r.ruleId));
  const out: Record<string, TaskState> = { ...tasks };
  let changed = false;

  for (const ruleId of open) {
    const existing = out[ruleId];
    if (!existing) {
      out[ruleId] = { id: ruleId, column: "todo", createdAt: now, updatedAt: now };
      changed = true;
    } else if (existing.column === "done" && existing.closedByAudit) {
      out[ruleId] = { ...existing, column: "todo", regression: true, closedByAudit: undefined, updatedAt: now };
      changed = true;
    }
  }
  for (const [ruleId, task] of Object.entries(out)) {
    if (resolved.has(ruleId) && !(task.column === "done" && task.closedByAudit)) {
      out[ruleId] = { ...task, column: "done", closedByAudit: true, unconfirmed: undefined, regression: undefined, updatedAt: now };
      changed = true;
    } else if (!open.has(ruleId) && !resolved.has(ruleId) && task.column !== "done") {
      // Rule no longer applies (project changed): drop the task.
      delete out[ruleId];
      changed = true;
    }
  }
  return changed ? out : undefined;
}
