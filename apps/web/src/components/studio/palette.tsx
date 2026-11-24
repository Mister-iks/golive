"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ACTORS, ACTOR_KINDS, COMPONENT_KINDS, KINDS, type ActorKind, type ComponentKind } from "@golive/spec";
import { ACTOR_ICON, KIND_ICON } from "../kind-icon";

export type PaletteItem = { type: "component"; kind: ComponentKind } | { type: "actor"; kind: ActorKind };
export const DND_MIME = "application/x-golive-item";

const GROUP_ORDER = ["Acteurs", "Clients", "Applicatif", "Données", "Réseau", "Services tiers", "Exploitation"] as const;

export function Palette({ onAdd }: { onAdd: (item: PaletteItem) => void }) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (...s: string[]) => !needle || s.some((x) => x.toLowerCase().includes(needle));
    const items: { group: string; item: PaletteItem; label: string; hint: string }[] = [
      ...ACTOR_KINDS.filter((k) => match(ACTORS[k].label, ACTORS[k].hint, k)).map((k) => ({
        group: "Acteurs",
        item: { type: "actor" as const, kind: k },
        label: ACTORS[k].label,
        hint: ACTORS[k].hint,
      })),
      ...COMPONENT_KINDS.filter((k) => match(KINDS[k].label, KINDS[k].hint, k, ...KINDS[k].techs)).map((k) => ({
        group: KINDS[k].group,
        item: { type: "component" as const, kind: k },
        label: KINDS[k].label,
        hint: KINDS[k].hint,
      })),
    ];
    return GROUP_ORDER.map((g) => ({ g, items: items.filter((i) => i.group === g) })).filter((x) => x.items.length);
  }, [q]);

  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-surface" aria-label="Bibliothèque de composants">
      <div className="border-b border-line p-2.5">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 focus-within:border-fg-3">
          <Search size={13} className="text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Composant ou techno…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-4"
            aria-label="Rechercher un composant"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map(({ g, items }) => (
          <div key={g} className="pt-3">
            <p className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">{g}</p>
            {items.map(({ item, label, hint }) => {
              const Icon = item.type === "actor" ? ACTOR_ICON[item.kind] : KIND_ICON[item.kind];
              return (
                <button
                  key={`${item.type}:${item.kind}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, JSON.stringify(item));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAdd(item)}
                  title={`${hint}. Glissez sur le canevas ou cliquez pour ajouter.`}
                  className="group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-fg-2 hover:bg-sunken hover:text-fg active:cursor-grabbing"
                >
                  <span className="grid size-6 place-items-center rounded-md border border-line bg-surface-2 text-fg-2 group-hover:border-line-strong">
                    <Icon size={13} strokeWidth={1.75} />
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="px-2 pt-6 text-center text-xs text-fg-3">Aucun résultat.</p>}
      </div>
    </aside>
  );
}
