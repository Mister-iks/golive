"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { CATEGORY_LABELS, COMMUNITY_PACKS } from "@golive/engine";
import type { Rule } from "@golive/packs-sdk";
import { PageHeader, Shell } from "@/components/shell";
import { cx, SeverityTag } from "@/components/ui";

const METHOD = { auto: "Automatique", evidence: "Preuve", hybrid: "Automatique ou preuve" };
const LAYER = { 1: "Architecture", 2: "Code", 3: "Site en ligne", 4: "IA" };

export default function RulesPage() {
  const [q, setQ] = useState("");
  const [pack, setPack] = useState<string>("all");

  const packs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return COMMUNITY_PACKS.filter((p) => pack === "all" || p.id === pack)
      .map((p) => ({
        ...p,
        rules: p.rules.filter((r) => !needle || [r.id, r.title, r.why, r.source.label].some((s) => s.toLowerCase().includes(needle))),
      }))
      .filter((p) => p.rules.length);
  }, [q, pack]);

  const total = COMMUNITY_PACKS.reduce((n, p) => n + p.rules.length, 0);

  return (
    <Shell>
      <PageHeader title="Catalogue des règles">
        <label className="flex h-8 w-72 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 focus-within:border-fg-3">
          <Search size={13} className="text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une règle, une source…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-4" />
        </label>
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-line bg-surface px-2 py-3 max-md:hidden">
          <p className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">Packs</p>
          {[{ id: "all", name: "Tous les packs", rules: { length: total } }, ...COMMUNITY_PACKS].map((p) => (
            <button
              key={p.id}
              onClick={() => setPack(p.id)}
              className={cx("flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[13px]", pack === p.id ? "bg-sunken font-medium" : "text-fg-2 hover:bg-sunken/70")}
            >
              {p.name}
              <span className="tnum font-mono text-[11px] text-fg-3">{p.rules.length}</span>
            </button>
          ))}
          <p className="mt-6 px-2 text-[11.5px] leading-relaxed text-fg-3">
            Les packs sont ouverts (Apache-2.0) et versionnés. Une règle se contribue par pull request, avec ses tests.
          </p>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[980px] px-6 py-6">
            {packs.map((p) => (
              <section key={p.id} className="mb-10">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-semibold tracking-tight">{p.name}</h2>
                    <p className="text-[13px] text-fg-3">{p.description}</p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px] text-fg-3">
                    <p>
                      {p.id}@{p.version}
                    </p>
                    <p>{p.reviewedAt ? `revu le ${p.reviewedAt}` : p.rules.some((r) => r.legal) ? "revue juridique à venir" : p.maintainer}</p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  {p.rules.map((r) => (
                    <RuleItem key={r.id} r={r} />
                  ))}
                </div>
              </section>
            ))}
            {packs.length === 0 && <p className="py-16 text-center text-[13px] text-fg-3">Aucune règle ne correspond.</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function RuleItem({ r }: { r: Rule }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-line px-4 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{r.title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{r.why}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
          <span className="font-mono">{r.id}</span>
          <span>Couche {r.layer} · {LAYER[r.layer]}</span>
          <span>{CATEGORY_LABELS[r.category]}</span>
          <span>{METHOD[r.method]}</span>
          {r.source.url ? (
            <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
              {r.source.label} <ExternalLink size={10} />
            </a>
          ) : (
            <span>{r.source.label}</span>
          )}
        </p>
      </div>
      <div className="pt-0.5">{typeof r.severity === "string" ? <SeverityTag severity={r.severity} /> : <span className="font-mono text-[10px] uppercase text-fg-3">selon profil</span>}</div>
    </div>
  );
}
