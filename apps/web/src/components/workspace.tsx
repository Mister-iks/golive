"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Download, Eye, FileJson, FolderKanban } from "lucide-react";
import type { Report } from "@golive/engine";
import { useStore, type Project } from "@/lib/store";
import { download, exportYaml, slug } from "@/lib/format";
import { useMessages } from "@/i18n/client";
import { workspaceMessages } from "@/i18n/messages/workspace";
import { useProject, useReport } from "@/lib/use-report";
import { Board } from "./board";
import { Checks } from "./checks";
import { Menu, MenuItem } from "./menu";
import { ReportView } from "./report";
import { Sheet } from "./sheet";
import { Shell } from "./shell";
import { Studio } from "./studio/studio";
import { Button, cx, Empty, Kbd, ScoreGauge, Tip, VerdictPill } from "./ui";
import { YamlEditor } from "./yaml-editor";

const TABS = [
  { id: "studio", key: "1" },
  { id: "sheet", key: "2" },
  { id: "checks", key: "3" },
  { id: "tasks", key: "4" },
  { id: "report", key: "5" },
  { id: "spec", key: "6" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export interface WorkspaceProps {
  project: Project;
  report: Report;
  go: (tab: TabId, hash?: string) => void;
}

export function Workspace({ id }: { id: string }) {
  const m = useMessages(workspaceMessages);
  const { project, error } = useProject(id);
  const report = useReport(project);
  const saving = useStore((s) => s.saving[id]);

  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "studio") as TabId;
  const go = (t: TabId, hash?: string) => router.replace(`/p/${id}?tab=${t}${hash ? `#${hash}` : ""}`, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], .cm-editor")) return;
      if (e.altKey && /^[1-6]$/.test(e.key)) {
        const t = TABS.find((x) => x.key === e.key);
        if (t) {
          e.preventDefault();
          go(t.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (error) {
    return (
      <Shell>
        <Empty icon={<FolderKanban size={16} />} title={m.notFound} action={<Link href="/"><Button>{m.backToProjects}</Button></Link>}>
          {error}
        </Empty>
      </Shell>
    );
  }
  if (!project || !report) return <Shell>{null}</Shell>;

  const openTasks = Object.values(project.tasks).filter((t) => t.column !== "done").length;
  const props: WorkspaceProps = { project, report, go };

  return (
    <Shell>
      <header className="no-print shrink-0 border-b border-line bg-surface">
        <div className="flex h-12 items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <Link href="/" className="text-fg-3 hover:text-fg">
              {m.projects}
            </Link>
            <ChevronRight size={13} className="text-fg-4" />
            <ProjectName project={project} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-fg-3 max-md:hidden" aria-live="polite">
              {!project.rights.edit ? (
                <span className="flex items-center gap-1">
                  <Eye size={12} /> {project.rights.contribute ? m.contribution : m.readOnly}
                </span>
              ) : saving ? (
                m.saving
              ) : (
                m.saved
              )}
            </span>
            <Tip label={report.verdict.reasons.join(" ")}>
              <button onClick={() => go("checks")} className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-sunken">
                <ScoreGauge value={report.score.global} threshold={report.threshold} size={30} />
                <VerdictPill decision={report.verdict.decision} />
              </button>
            </Tip>
            <Menu
              trigger={
                <Button icon={<Download size={14} />} aria-label={m.export}>
                  {m.export}
                </Button>
              }
            >
              <MenuItem icon={<Download size={14} />} onSelect={() => exportYaml(project.spec)}>
                golive.yaml
              </MenuItem>
              <MenuItem
                icon={<FileJson size={14} />}
                onSelect={() => download(`golive-report-${slug(project.spec.project.name)}.json`, JSON.stringify(report, null, 2), "application/json")}
              >
                {m.jsonReport}
              </MenuItem>
            </Menu>
          </div>
        </div>
        <nav className="flex h-10 items-end gap-1 px-3" role="tablist" aria-label={m.sections}>
          {TABS.map((t) => (
            <Tip key={t.id} label={<span className="flex items-center gap-1.5">{m.shortcut} <Kbd>Alt</Kbd><Kbd>{t.key}</Kbd></span>} side="bottom">
              <button
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => go(t.id)}
                className={cx(
                  "relative flex h-9 items-center gap-1.5 px-2.5 text-[13px] transition-colors",
                  tab === t.id ? "text-fg" : "text-fg-3 hover:text-fg",
                  t.id === "spec" && "font-mono text-xs",
                )}
              >
                {m.tabs[t.id]}
                {t.id === "checks" && report.counts.blocking > 0 && <Count tone="red">{report.counts.blocking}</Count>}
                {t.id === "tasks" && openTasks > 0 && <Count>{openTasks}</Count>}
                {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
              </button>
            </Tip>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "studio" && <Studio {...props} />}
        {tab === "sheet" && <Sheet {...props} />}
        {tab === "checks" && <Checks {...props} />}
        {tab === "tasks" && <Board {...props} />}
        {tab === "report" && <ReportView {...props} />}
        {tab === "spec" && <YamlEditor {...props} />}
      </div>
    </Shell>
  );
}

function Count({ children, tone }: { children: ReactNode; tone?: "red" }) {
  return (
    <span className={cx("tnum rounded-full px-1.5 text-[10.5px] font-medium leading-4", tone === "red" ? "bg-red-soft text-red" : "bg-sunken text-fg-2")}>
      {children}
    </span>
  );
}

function ProjectName({ project }: { project: Project }) {
  const m = useMessages(workspaceMessages);
  const update = useStore((s) => s.update);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.spec.project.name);

  const commit = () => {
    const name = value.trim();
    if (name && name !== project.spec.project.name) update(project.id, (s) => ({ ...s, project: { ...s.project, name } }));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-64 rounded-md border border-line-strong bg-surface px-2 text-[13px] font-medium outline-none"
        aria-label={m.projectName}
      />
    );
  }
  return (
    <button
      onClick={() => {
        setValue(project.spec.project.name);
        setEditing(true);
      }}
      className="truncate rounded-md px-1.5 py-0.5 font-medium hover:bg-sunken"
      title={m.rename}
    >
      {project.spec.project.name}
    </button>
  );
}
