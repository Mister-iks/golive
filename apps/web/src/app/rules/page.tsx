"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { categoryLabels, COMMUNITY_PACKS } from "@golive/engine";
import type { Rule } from "@golive/packs-sdk";
import { PageHeader, Shell } from "@/components/shell";
import { cx, SeverityTag } from "@/components/ui";
import type { Lang } from "@/i18n";
import { useLang, useMessages } from "@/i18n/client";
import { rulesMessages } from "@/i18n/messages/rules";

/** Rule texts in the interface language (French translations live in rule.fr). */
const ruleText = (r: Rule, lang: Lang) => {
  const fr = lang === "fr" ? r.fr : undefined;
  return { title: fr?.title ?? r.title, why: fr?.why ?? r.why, source: fr?.source ?? r.source.label };
};

export default function RulesPage() {
  const t = useMessages(rulesMessages);
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [pack, setPack] = useState<string>("all");

  const localized = useMemo(
    () =>
      COMMUNITY_PACKS.map((p) => ({
        ...p,
        name: (lang === "fr" && p.fr?.name) || p.name,
        description: (lang === "fr" && p.fr?.description) || p.description,
      })),
    [lang],
  );

  const packs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return localized
      .filter((p) => pack === "all" || p.id === pack)
      .map((p) => ({
        ...p,
        rules: p.rules.filter((r) => {
          if (!needle) return true;
          const x = ruleText(r, lang);
          return [r.id, x.title, x.why, x.source].some((s) => s.toLowerCase().includes(needle));
        }),
      }))
      .filter((p) => p.rules.length);
  }, [q, pack, localized, lang]);

  const total = COMMUNITY_PACKS.reduce((n, p) => n + p.rules.length, 0);

  return (
    <Shell>
      <PageHeader title={t.title}>
        <label className="flex h-8 w-72 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 focus-within:border-fg-3">
          <Search size={13} className="text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-4" />
        </label>
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-line bg-surface px-2 py-3 max-md:hidden">
          <p className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">{t.packs}</p>
          {[{ id: "all", name: t.allPacks, rules: { length: total } }, ...localized].map((p) => (
            <button
              key={p.id}
              onClick={() => setPack(p.id)}
              className={cx("flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[13px]", pack === p.id ? "bg-sunken font-medium" : "text-fg-2 hover:bg-sunken/70")}
            >
              {p.name}
              <span className="tnum font-mono text-[11px] text-fg-3">{p.rules.length}</span>
            </button>
          ))}
          <p className="mt-6 px-2 text-[11.5px] leading-relaxed text-fg-3">{t.openPacks}</p>
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
                    <p>{p.reviewedAt ? t.reviewed(p.reviewedAt) : p.rules.some((r) => r.legal) ? t.legalPending : p.maintainer}</p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  {p.rules.map((r) => (
                    <RuleItem key={r.id} r={r} />
                  ))}
                </div>
              </section>
            ))}
            {packs.length === 0 && <p className="py-16 text-center text-[13px] text-fg-3">{t.none}</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function RuleItem({ r }: { r: Rule }) {
  const t = useMessages(rulesMessages);
  const { lang } = useLang();
  const x = ruleText(r, lang);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-line px-4 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{x.title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{x.why}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
          <span className="font-mono">{r.id}</span>
          <span>{t.layer(r.layer, t.layers[r.layer] ?? "")}</span>
          <span>{categoryLabels(lang)[r.category]}</span>
          <span>{t.methods[r.method]}</span>
          {r.source.url ? (
            <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
              {x.source} <ExternalLink size={10} />
            </a>
          ) : (
            <span>{x.source}</span>
          )}
        </p>
      </div>
      <div className="pt-0.5">{typeof r.severity === "string" ? <SeverityTag severity={r.severity} /> : <span className="font-mono text-[10px] uppercase text-fg-3">{t.byProfile}</span>}</div>
    </div>
  );
}
