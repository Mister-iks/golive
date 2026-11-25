import { parseTech, type ActorKind, type Component, type ComponentKind, type Protocol, type Spec } from "@golive/spec";

export function uniqueId(spec: Spec, base: string): string {
  const taken = new Set([...spec.components.map((c) => c.id), ...spec.actors.map((a) => a.id)]);
  const clean = base.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/^-+|-+$/g, "") || "element";
  if (!taken.has(clean)) return clean;
  for (let i = 2; ; i++) if (!taken.has(`${clean}-${i}`)) return `${clean}-${i}`;
}

const SHORT: Partial<Record<ComponentKind, string>> = {
  frontend: "web",
  backend: "service",
  database: "db",
  "load-balancer": "lb",
  monitoring: "monitoring",
  storage: "storage",
};

export function addComponent(spec: Spec, kind: ComponentKind, at: [number, number]): { spec: Spec; id: string } {
  const id = uniqueId(spec, SHORT[kind] ?? kind);
  const component: Component = { id, kind };
  return {
    id,
    spec: { ...spec, components: [...spec.components, component], layout: { ...spec.layout, [id]: at } },
  };
}

export function addActor(spec: Spec, kind: ActorKind, at: [number, number]): { spec: Spec; id: string } {
  const id = uniqueId(spec, kind);
  return { id, spec: { ...spec, actors: [...spec.actors, { id, kind }], layout: { ...spec.layout, [id]: at } } };
}

export function removeElement(spec: Spec, id: string): Spec {
  const { [id]: _, ...layout } = spec.layout ?? {};
  return {
    ...spec,
    components: spec.components.filter((c) => c.id !== id),
    actors: spec.actors.filter((a) => a.id !== id),
    links: spec.links.filter((l) => l.from !== id && l.to !== id),
    layout,
  };
}

/** Returns the renamed spec, or an error code the interface translates. */
export function renameElement(spec: Spec, from: string, to: string): Spec | "invalid" | "taken" {
  if (from === to) return spec;
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(to)) return "invalid";
  if (spec.components.some((c) => c.id === to) || spec.actors.some((a) => a.id === to)) return "taken";
  const { [from]: pos, ...layout } = spec.layout ?? {};
  return {
    ...spec,
    components: spec.components.map((c) => (c.id === from ? { ...c, id: to } : c)),
    actors: spec.actors.map((a) => (a.id === from ? { ...a, id: to } : a)),
    links: spec.links.map((l) => ({ ...l, from: l.from === from ? to : l.from, to: l.to === from ? to : l.to })),
    waivers: spec.waivers.map((w) => (w.target === from ? { ...w, target: to } : w)),
    layout: pos ? { ...layout, [to]: pos } : layout,
  };
}

/** Sensible default protocol for a new link, always the encrypted variant. */
export function defaultProtocol(spec: Spec, fromId: string, toId: string): Protocol {
  const to = spec.components.find((c) => c.id === toId);
  const fromActor = spec.actors.some((a) => a.id === fromId);
  if (fromActor && to?.kind === "mobile") return "internal";
  if (!to) return "https";
  const tech = parseTech(to.tech)?.name ?? "";
  switch (to.kind) {
    case "database":
      if (tech.startsWith("mysql") || tech.startsWith("mariadb")) return "mysql-tls";
      if (tech.startsWith("mongo")) return "mongodb-tls";
      return "postgres-tls";
    case "cache":
      return "rediss";
    case "queue":
      return tech === "kafka" ? "kafka-tls" : "amqps";
    case "storage":
      return "s3";
    default:
      return "https";
  }
}

export function addLink(spec: Spec, from: string, to: string): Spec {
  if (from === to) return spec;
  if (spec.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) return spec;
  return { ...spec, links: [...spec.links, { from, to, protocol: defaultProtocol(spec, from, to) }] };
}

export const linkId = (l: { from: string; to: string }) => `${l.from}->${l.to}`;

export function updateComponent(spec: Spec, id: string, patch: Partial<Component>): Spec {
  return {
    ...spec,
    components: spec.components.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch };
      for (const k of Object.keys(next) as (keyof Component)[]) if (next[k] === "" || next[k] === undefined) delete next[k];
      if (next.hosting) {
        const h = { ...next.hosting };
        if (!h.provider) delete h.provider;
        if (!h.country) delete h.country;
        if (!h.region) delete h.region;
        if (Object.keys(h).length) next.hosting = h;
        else delete next.hosting;
      }
      return next;
    }),
  };
}

/** Find a free spot to drop a node near a point (avoids stacking). */
export function freeSpot(spec: Spec, at: [number, number]): [number, number] {
  const taken = Object.values(spec.layout ?? {});
  let [x, y] = at;
  for (let i = 0; i < 40 && taken.some(([tx, ty]) => Math.abs(tx - x) < 120 && Math.abs(ty - y) < 50); i++) y += 76;
  return [Math.round(x / 20) * 20, Math.round(y / 20) * 20];
}
