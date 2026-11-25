"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { ActorKind, ComponentKind } from "@golive/spec";
import { useCatalog, useMessages } from "@/i18n/client";
import { studioMessages } from "@/i18n/messages/studio";
import type { Severity, Status } from "@golive/packs-sdk";
import { ACTOR_ICON, KIND_ICON } from "../kind-icon";
import { cx } from "../ui";

export interface Issue {
  ruleId: string;
  title: string;
  status: Status;
  severity: Severity;
  message: string;
}

export type ComponentNodeData = {
  kind: ComponentKind;
  label: string;
  tech?: string;
  runtime?: string;
  country?: string;
  exposure: "public" | "private" | "managed";
  issues: Issue[];
};
export type ActorNodeData = { kind: ActorKind; label: string; issues: Issue[] };
export type LinkEdgeData = { protocol: string; plaintext: boolean; issues: Issue[]; label?: string };

export type ComponentNode = Node<ComponentNodeData, "component">;
export type ActorNode = Node<ActorNodeData, "actor">;
export type LinkEdge = Edge<LinkEdgeData, "link">;

const sevRank: Record<Severity, number> = { blocker: 0, major: 1, minor: 2, info: 3 };

export function worstIssue(issues: Issue[]): Issue | undefined {
  return [...issues].sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (a.status === "fail" ? -1 : 1))[0];
}

export function toneOf(issue?: Issue): "red" | "amber" | "blue" | undefined {
  if (!issue) return undefined;
  if (issue.status === "evidence") return "blue";
  if (issue.severity === "blocker" || (issue.status === "fail" && issue.severity === "major")) return "red";
  return "amber";
}

const handleCls = "!border-fg-3 !bg-surface";

function Handles() {
  return (
    <>
      <Handle id="l" type="source" position={Position.Left} className={handleCls} />
      <Handle id="r" type="source" position={Position.Right} className={handleCls} />
    </>
  );
}

function IssueBadge({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  const tone = toneOf(worstIssue(issues));
  return (
    <span
      className={cx(
        "tnum absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold ring-2 ring-bg",
        tone === "red" && "bg-red text-white",
        tone === "amber" && "bg-amber text-white dark:text-black",
        tone === "blue" && "bg-blue text-white",
      )}
    >
      {issues.length}
    </span>
  );
}

export const ComponentNodeView = memo(function ComponentNodeView({ data, selected }: NodeProps<ComponentNode>) {
  const t = useMessages(studioMessages);
  const { KINDS } = useCatalog();
  const Icon = KIND_ICON[data.kind];
  const tone = toneOf(worstIssue(data.issues));
  const techs = [data.tech, data.runtime].filter(Boolean).join(" · ");
  return (
    <div
      className={cx(
        "relative w-[200px] rounded-lg border bg-surface transition-[box-shadow,border-color]",
        selected ? "border-fg shadow-[0_0_0_3px_color-mix(in_oklab,var(--fg)_12%,transparent)]" : "border-line-strong hover:border-fg-4",
      )}
    >
      {tone && (
        <span className={cx("absolute inset-y-2 -left-px w-[2px] rounded-full", tone === "red" ? "bg-red" : tone === "amber" ? "bg-amber" : "bg-blue")} />
      )}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-fg-3">
          <Icon size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em]">{KINDS[data.kind].label}</span>
        </span>
        <span className="flex items-center gap-1">
          {data.exposure === "public" && (
            <span className="rounded-[3px] border border-line px-1 font-mono text-[9px] uppercase leading-[14px] text-fg-2" title={t.reachable}>
              Internet
            </span>
          )}
          {data.country && <span className="rounded-[3px] bg-sunken px-1 font-mono text-[9.5px] leading-[14px] text-fg-2">{data.country}</span>}
        </span>
      </div>
      <p className="truncate px-3 pt-1 text-[13px] font-medium leading-tight text-fg">{data.label}</p>
      <p className={cx("truncate px-3 pb-2.5 pt-0.5 font-mono text-[10.5px]", techs ? "text-fg-3" : "italic text-fg-4")}>{techs || t.techUnknown}</p>
      <IssueBadge issues={data.issues} />
      <Handles />
    </div>
  );
});

export const ActorNodeView = memo(function ActorNodeView({ data, selected }: NodeProps<ActorNode>) {
  const { ACTORS } = useCatalog();
  const Icon = ACTOR_ICON[data.kind];
  return (
    <div
      className={cx(
        "relative flex h-9 items-center gap-2 rounded-full border bg-surface-2 pl-1.5 pr-3.5 transition-[box-shadow,border-color]",
        selected ? "border-fg shadow-[0_0_0_3px_color-mix(in_oklab,var(--fg)_12%,transparent)]" : "border-dashed border-fg-4 hover:border-fg-3",
      )}
    >
      <span className="grid size-6 place-items-center rounded-full bg-sunken text-fg-2">
        <Icon size={13} strokeWidth={1.75} />
      </span>
      <span className="max-w-[140px] truncate text-[12.5px] font-medium">{data.label}</span>
      <span className="font-mono text-[9.5px] uppercase tracking-wider text-fg-3">{ACTORS[data.kind].label}</span>
      <IssueBadge issues={data.issues} />
      <Handles />
    </div>
  );
});

export const LinkEdgeView = memo(function LinkEdgeView(props: EdgeProps<LinkEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const t = useMessages(studioMessages);
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.3 });
  const tone = toneOf(worstIssue(data?.issues ?? []));
  const stroke = tone === "red" ? "var(--red)" : tone === "amber" ? "var(--amber)" : selected ? "var(--fg)" : "var(--fg-4)";
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: selected ? 1.75 : 1.25, strokeDasharray: data?.plaintext ? "5 4" : undefined }}
        interactionWidth={18}
      />
      <EdgeLabelRenderer>
        <div
          className={cx(
            "nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded border px-1 font-mono text-[9.5px] leading-[15px]",
            tone === "red" ? "border-red-line bg-red-soft text-red-ink" : selected ? "border-fg bg-surface text-fg" : "border-line bg-bg text-fg-3",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
        >
          {data?.protocol === "internal" ? t.internal : data?.protocol}
          {data?.label && <span className="font-sans text-fg-3">· {data.label}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const nodeTypes = { component: ComponentNodeView, actor: ActorNodeView };
export const edgeTypes = { link: LinkEdgeView };
