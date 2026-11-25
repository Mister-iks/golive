"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluate, type Report } from "@golive/engine";
import { useLang } from "@/i18n/client";
import { ApiError } from "./api";
import { useStore, type Project } from "./store";

export const today = () => new Date().toISOString().slice(0, 10);

/** Live evaluation in the browser: the same engine as the server, so edits show their effect instantly. */
export function useReport(project: Project | undefined): Report | undefined {
  const { lang } = useLang();
  return useMemo(() => (project ? evaluate(project.spec, { web: project.web, asOf: today(), lang }) : undefined), [project?.spec, project?.web, lang]);
}

let meRequest: Promise<unknown> | undefined;

/** Session, organizations and the current organization. */
export function useMe() {
  const me = useStore((s) => s.me);
  const orgId = useStore((s) => s.orgId);
  useEffect(() => {
    if (!me) meRequest ??= useStore.getState().loadMe().catch(() => (meRequest = undefined));
  }, [me]);
  const org = me?.orgs.find((o) => o.id === orgId);
  return { me, org, orgId };
}

/** Loads a project from the server (once per page visit). */
export function useProject(id: string) {
  const project = useStore((s) => s.projects[id]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    useStore
      .getState()
      .loadProject(id)
      .catch((e: ApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  return { project, error };
}
