"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluate, type Report } from "@golive/engine";
import { useStore, type Project } from "./store";

export const today = () => new Date().toISOString().slice(0, 10);

export function useReport(project: Project | undefined): Report | undefined {
  return useMemo(() => (project ? evaluate(project.spec, { web: project.web, asOf: today() }) : undefined), [project?.spec, project?.web]);
}

/** Keeps the remediation board in sync with the latest evaluation. */
export function useTaskSync(projectId: string, report: Report | undefined) {
  const sync = useStore((s) => s.syncTasks);
  useEffect(() => {
    if (report) sync(projectId, report);
  }, [projectId, report, sync]);
}

/** True once persisted state has been read from localStorage. */
export function useHydrated() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const persist = useStore.persist;
    if (!persist) return;
    if (persist.hasHydrated()) setOk(true);
    return persist.onFinishHydration(() => setOk(true));
  }, []);
  return ok;
}
