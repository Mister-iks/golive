"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { ENCRYPTED_PROTOCOLS } from "@golive/spec";
import { buildGraph } from "@golive/packs-sdk";
import { findingsByTarget } from "@golive/engine";
import { useMessages } from "@/i18n/client";
import { studioMessages } from "@/i18n/messages/studio";
import { useStore } from "@/lib/store";
import type { WorkspaceProps } from "../workspace";
import { Inspector } from "./inspector";
import { edgeTypes, nodeTypes, type ActorNode, type ComponentNode, type Issue, type LinkEdge } from "./nodes";
import { DND_MIME, Palette, type PaletteItem } from "./palette";
import { addActor, addComponent, addLink, freeSpot, linkId, removeElement } from "./spec-ops";

type AnyNode = ComponentNode | ActorNode;

export function Studio(props: WorkspaceProps) {
  return (
    <ReactFlowProvider>
      <StudioInner {...props} />
    </ReactFlowProvider>
  );
}

function StudioInner({ project, report, go }: WorkspaceProps) {
  const t = useMessages(studioMessages);
  const update = useStore((s) => s.update);
  const { spec } = project;
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ type: "node" | "edge"; id: string } | null>(null);

  const issues = useMemo(() => findingsByTarget(report) as Map<string, Issue[]>, [report]);

  const derived = useMemo<AnyNode[]>(() => {
    const graph = buildGraph(spec);
    const pos = (id: string, i: number) => {
      const p = spec.layout?.[id];
      return p ? { x: p[0], y: p[1] } : { x: 80 + (i % 4) * 260, y: 80 + Math.floor(i / 4) * 120 };
    };
    return [
      ...spec.actors.map<ActorNode>((a, i) => ({
        id: a.id,
        type: "actor",
        position: pos(a.id, i),
        data: { kind: a.kind, label: a.name ?? a.id, issues: issues.get(a.id) ?? [] },
      })),
      ...spec.components.map<ComponentNode>((c, i) => ({
        id: c.id,
        type: "component",
        position: pos(c.id, i + spec.actors.length),
        data: {
          kind: c.kind,
          label: c.name ?? c.id,
          tech: c.tech,
          runtime: c.runtime,
          country: graph.country(c),
          exposure: graph.exposure(c),
          issues: issues.get(c.id) ?? [],
        },
      })),
    ];
  }, [spec, issues]);

  // Local node state for smooth dragging; positions are committed on drag stop.
  const [nodes, setNodes] = useState<AnyNode[]>(derived);
  useEffect(() => {
    setNodes((prev) => {
      const sel = new Map(prev.map((n) => [n.id, n.selected]));
      return derived.map((n) => ({ ...n, selected: sel.get(n.id) ?? false }));
    });
  }, [derived]);

  const edges = useMemo<LinkEdge[]>(() => {
    const at = (id: string) => spec.layout?.[id]?.[0] ?? 0;
    return spec.links.map((l) => {
      const id = linkId(l);
      const forward = at(l.from) <= at(l.to);
      return {
        id,
        type: "link",
        source: l.from,
        target: l.to,
        sourceHandle: forward ? "r" : "l",
        targetHandle: forward ? "l" : "r",
        selected: selection?.type === "edge" && selection.id === id,
        data: {
          protocol: l.protocol,
          label: l.label,
          plaintext: l.protocol !== "internal" && !ENCRYPTED_PROTOCOLS.has(l.protocol),
          issues: issues.get(id) ?? [],
        },
      };
    });
  }, [spec.links, spec.layout, issues, selection]);

  const onNodesChange = useCallback((changes: NodeChange<AnyNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
    if (removed.length) {
      update(project.id, (s) => removed.reduce(removeElement, s));
      setSelection(null);
    }
  }, [project.id, update]);

  const onNodeDragStop = useCallback(
    (_: unknown, __: AnyNode, dragged: AnyNode[]) => {
      update(project.id, (s) => {
        const layout = { ...s.layout };
        for (const n of dragged) layout[n.id] = [Math.round(n.position.x), Math.round(n.position.y)];
        return { ...s, layout };
      });
    },
    [project.id, update],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      update(project.id, (s) => addLink(s, c.source, c.target));
      setSelection({ type: "edge", id: `${c.source}->${c.target}` });
    },
    [project.id, update],
  );

  const add = useCallback(
    (item: PaletteItem, screen?: { x: number; y: number }) => {
      let at: [number, number];
      if (screen) {
        const p = rf.screenToFlowPosition(screen);
        at = [Math.round(p.x - 100), Math.round(p.y - 30)];
      } else {
        const rect = wrapper.current?.getBoundingClientRect();
        const p = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 });
        at = freeSpot(spec, [p.x - 100, p.y - 30]);
      }
      let newId = "";
      update(project.id, (s) => {
        const r = item.type === "actor" ? addActor(s, item.kind, at) : addComponent(s, item.kind, at);
        newId = r.id;
        return r.spec;
      });
      setSelection({ type: "node", id: newId });
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === newId })));
    },
    [project.id, rf, spec, update],
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === "node") update(project.id, (s) => removeElement(s, selection.id));
    else update(project.id, (s) => ({ ...s, links: s.links.filter((l) => linkId(l) !== selection.id) }));
    setSelection(null);
  }, [project.id, selection, update]);

  const empty = spec.components.length === 0 && spec.actors.length === 0;
  const blockersOnCanvas = [...issues.values()].flat().filter((i) => i.severity === "blocker").length;

  return (
    <div className="flex h-full">
      <Palette onAdd={(item) => add(item)} />
      <div
        ref={wrapper}
        className="relative min-w-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(DND_MIME);
          if (!raw) return;
          e.preventDefault();
          add(JSON.parse(raw) as PaletteItem, { x: e.clientX, y: e.clientY });
        }}
      >
        <ReactFlow<AnyNode, LinkEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          onNodeClick={(_, n) => setSelection({ type: "node", id: n.id })}
          onEdgeClick={(_, e) => setSelection({ type: "edge", id: e.id })}
          onPaneClick={() => setSelection(null)}
          onEdgesDelete={(es) => update(project.id, (s) => ({ ...s, links: s.links.filter((l) => !es.some((e) => e.id === linkId(l))) }))}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
          minZoom={0.25}
          maxZoom={2}
          snapToGrid
          snapGrid={[20, 20]}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "link" }}
          connectionLineStyle={{ stroke: "var(--go)", strokeWidth: 1.5 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="var(--canvas-dot)" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(n) => ((n.data as { issues?: Issue[] }).issues?.some((i) => i.severity === "blocker") ? "var(--red)" : "var(--fg-4)")}
            nodeBorderRadius={4}
            maskColor="color-mix(in oklab, var(--bg) 70%, transparent)"
            style={{ width: 150, height: 96 }}
          />
        </ReactFlow>

        {empty ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="max-w-xs text-center">
              <p className="text-[13px] font-medium">{t.emptyTitle}</p>
              <p className="mt-1 text-[13px] text-fg-3">{t.emptyBody}</p>
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
            <div className="tnum flex items-center gap-3 whitespace-nowrap rounded-full border border-line bg-surface/90 px-3 py-1 text-[11.5px] text-fg-2 backdrop-blur">
              <span>{t.components(spec.components.length)}</span>
              <span className="text-fg-4">·</span>
              <span>{t.flows(spec.links.length)}</span>
              {blockersOnCanvas > 0 && (
                <>
                  <span className="text-fg-4">·</span>
                  <span className="font-medium text-red">{t.blockersOnCanvas(blockersOnCanvas)}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <Inspector project={project} report={report} go={go} selection={selection} onSelect={setSelection} onDelete={deleteSelection} />
    </div>
  );
}
