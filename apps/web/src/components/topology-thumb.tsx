import type { Spec, SpecInput } from "@golive/spec";

/** Tiny, static drawing of a spec's architecture (used on cards). */
export function TopologyThumb({ spec, issues, className }: { spec: Spec | SpecInput; issues?: Map<string, "blocker" | "other">; className?: string }) {
  const layout = spec.layout ?? {};
  const ids = [...(spec.components ?? []).map((c) => c.id), ...(spec.actors ?? []).map((a) => a.id)];
  const pts = ids.map((id) => layout[id]).filter(Boolean) as [number, number][];
  if (pts.length === 0) {
    return (
      <svg viewBox="0 0 200 90" className={className} aria-hidden>
        <rect x="70" y="32" width="60" height="26" rx="5" fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />
      </svg>
    );
  }
  const W = 200;
  const H = 90;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs) + 200, Math.min(...ys), Math.max(...ys) + 60];
  const s = Math.min((W - 16) / (maxX - minX || 1), (H - 16) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const pos = (id: string) => {
    const p = layout[id];
    if (!p) return undefined;
    return { x: ox + (p[0] - minX) * s, y: oy + (p[1] - minY) * s, w: 200 * s, h: 60 * s };
  };
  const actorIds = new Set((spec.actors ?? []).map((a) => a.id));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
      {(spec.links ?? []).map((l, i) => {
        const a = pos(l.from);
        const b = pos(l.to);
        if (!a || !b) return null;
        return <line key={i} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2} stroke="var(--fg-4)" strokeWidth="0.8" />;
      })}
      {ids.map((id) => {
        const p = pos(id);
        if (!p) return null;
        const issue = issues?.get(id);
        const actor = actorIds.has(id);
        return (
          <rect
            key={id}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx={actor ? p.h / 2 : 2.5}
            fill={issue === "blocker" ? "var(--red-soft)" : "var(--surface)"}
            stroke={issue === "blocker" ? "var(--red)" : "var(--fg-3)"}
            strokeWidth="0.9"
          />
        );
      })}
    </svg>
  );
}
