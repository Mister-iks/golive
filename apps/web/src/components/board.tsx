"use client";

import { useMemo, useState } from "react";
import { CircleCheck, CircleDashed, RotateCcw } from "lucide-react";
import type { RuleResult } from "@golive/engine";
import { boardMessages } from "@/i18n/messages/board";
import { useMessages } from "@/i18n/client";
import { useStore, type Column, type Task } from "@/lib/store";
import { Empty, SeverityTag, StatusIcon, Tip, cx } from "./ui";
import type { WorkspaceProps } from "./workspace";

const COLUMNS: Column[] = ["todo", "doing", "review", "done"];
const SEV = { blocker: 0, major: 1, minor: 2, info: 3 };
const DND = "application/x-golive-task";

export function Board({ project, report, go }: WorkspaceProps) {
  const t = useMessages(boardMessages);
  const move = useStore((s) => s.moveTask);
  const [over, setOver] = useState<Column | null>(null);
  const byRule = useMemo(() => new Map(report.results.map((r) => [r.ruleId, r])), [report]);

  const cols = useMemo(() => {
    const tasks = Object.values(project.tasks).filter((t) => byRule.has(t.id));
    return COLUMNS.map((id) => ({
      id,
      ...t.columns[id],
      tasks: tasks
        .filter((task) => task.column === id)
        .sort((a, b) => {
          const ra = byRule.get(a.id)!;
          const rb = byRule.get(b.id)!;
          return Number(rb.blocking) - Number(ra.blocking) || SEV[ra.severity] - SEV[rb.severity];
        }),
    }));
  }, [project.tasks, byRule, t]);

  const total = cols.reduce((n, c) => n + c.tasks.length, 0);
  if (total === 0) {
    return (
      <Empty icon={<CircleCheck size={16} />} title={t.emptyTitle}>
        {t.emptyBody}
      </Empty>
    );
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {cols.map((col) => (
        <section
          key={col.id}
          aria-label={col.label}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND)) {
              e.preventDefault();
              setOver(col.id);
            }
          }}
          onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(DND);
            setOver(null);
            if (id) move(project.id, id, col.id);
          }}
          className={cx(
            "flex min-w-[264px] flex-1 flex-col rounded-lg border bg-sunken/60 transition-colors",
            over === col.id ? "border-fg-3 bg-sunken" : "border-line",
          )}
        >
          <header className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-medium">{col.label}</h3>
              <span className="tnum font-mono text-[11px] text-fg-3">{col.tasks.length}</span>
            </div>
            {col.hint && <span className="text-[11px] text-fg-4">{col.hint}</span>}
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {col.tasks.map((task) => (
              <Card key={task.id} task={task} r={byRule.get(task.id)!} onOpen={() => go("checks", task.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({ task, r, onOpen }: { task: Task; r: RuleResult; onOpen: () => void }) {
  const t = useMessages(boardMessages);
  const open = r.findings.filter((f) => f.status !== "pass").length;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND, task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className="group cursor-grab rounded-md border border-line bg-surface p-3 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_4px_12px_-8px_rgb(0_0_0/0.3)] active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={r.status} size={13} className="mt-0.5" />
        <p className="flex-1 text-[13px] font-medium leading-snug">{r.title}</p>
      </div>
      <p className="mt-1 line-clamp-2 pl-[21px] text-xs text-fg-3">{r.findings.find((f) => f.status !== "pass")?.message ?? r.why}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[21px]">
        <SeverityTag severity={r.severity} />
        <span className="rounded bg-sunken px-1.5 text-[10.5px] leading-[18px] text-fg-2">{t.milestones[r.layer]}</span>
        {open > 1 && <span className="tnum text-[10.5px] text-fg-3">{t.findings(open)}</span>}
        <span className="ml-auto flex items-center gap-1">
          {task.regression && (
            <Tip label={t.regression}>
              <RotateCcw size={12} className="text-red" />
            </Tip>
          )}
          {task.unconfirmed && r.status !== "pass" && (
            <Tip label={t.unconfirmed}>
              <CircleDashed size={12} className="text-amber" />
            </Tip>
          )}
          {task.closedByAudit && (
            <Tip label={t.closedByAudit}>
              <CircleCheck size={12} className="text-go" />
            </Tip>
          )}
        </span>
      </div>
    </article>
  );
}
