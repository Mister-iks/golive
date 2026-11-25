"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import {
  ACTOR_KINDS,
  ENCRYPTED_PROTOCOLS,
  PROTOCOLS,
  SENSITIVITY,
  parseTech,
  type Component,
  type Protocol,
  type Spec,
} from "@golive/spec";
import { buildGraph } from "@golive/packs-sdk";
import { categoryLabels, findingsByTarget, type Report } from "@golive/engine";
import { useCatalog, useLang, useMessages } from "@/i18n/client";
import { inspectorMessages } from "@/i18n/messages/inspector";
import { useStore } from "@/lib/store";
import { ACTOR_ICON, KIND_ICON } from "../kind-icon";
import { Button, cx, Field, Input, ScoreGauge, SectionTitle, Select, SeverityTag, StatusIcon, Textarea, VerdictPill } from "../ui";
import type { WorkspaceProps } from "../workspace";
import type { Issue } from "./nodes";
import { linkId, renameElement, updateComponent } from "./spec-ops";

type Sel = { type: "node" | "edge"; id: string } | null;

export function Inspector({
  project,
  report,
  go,
  selection,
  onSelect,
  onDelete,
}: WorkspaceProps & { selection: Sel; onSelect: (s: Sel) => void; onDelete: () => void }) {
  const t = useMessages(inspectorMessages);
  const { ACTORS } = useCatalog();
  const update = useStore((s) => s.update);
  const issues = findingsByTarget(report) as Map<string, Issue[]>;
  const spec = project.spec;
  const set = (fn: (s: Spec) => Spec) => update(project.id, fn);

  let body: ReactNode;
  if (selection?.type === "node") {
    const c = spec.components.find((x) => x.id === selection.id);
    const a = spec.actors.find((x) => x.id === selection.id);
    if (c) body = <ComponentPanel key={c.id} c={c} spec={spec} set={set} onRenamed={(id) => onSelect({ type: "node", id })} issues={issues.get(c.id) ?? []} />;
    else if (a)
      body = (
        <Panel
          icon={(() => {
            const I = ACTOR_ICON[a.kind];
            return <I size={14} strokeWidth={1.75} />;
          })()}
          kicker={t.actor}
          title={a.name ?? a.id}
        >
          <div className="flex flex-col gap-3.5 p-4">
            <Field label={t.displayName}>
              <Input value={a.name ?? ""} placeholder={a.id} onChange={(e) => set((s) => ({ ...s, actors: s.actors.map((x) => (x.id === a.id ? { ...x, name: e.target.value || undefined } : x)) }))} />
            </Field>
            <Field label={t.actorType}>
              <Select value={a.kind} onChange={(e) => set((s) => ({ ...s, actors: s.actors.map((x) => (x.id === a.id ? { ...x, kind: e.target.value as typeof a.kind } : x)) }))}>
                {ACTOR_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ACTORS[k].label} · {ACTORS[k].hint}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <IssueList issues={issues.get(a.id) ?? []} />
        </Panel>
      );
  } else if (selection?.type === "edge") {
    const l = spec.links.find((x) => linkId(x) === selection.id);
    if (l) {
      const g = buildGraph(spec);
      const patch = (p: Partial<typeof l>) => set((s) => ({ ...s, links: s.links.map((x) => (linkId(x) === selection.id ? { ...x, ...p } : x)) }));
      const encrypted = PROTOCOLS.filter((p) => ENCRYPTED_PROTOCOLS.has(p));
      const plain = PROTOCOLS.filter((p) => !ENCRYPTED_PROTOCOLS.has(p) && p !== "internal");
      body = (
        <Panel
          icon={<ArrowRight size={14} />}
          kicker={t.flow}
          title={
            <span className="flex items-center gap-1.5">
              {g.label(l.from)} <ArrowRight size={12} className="text-fg-3" /> {g.label(l.to)}
            </span>
          }
        >
          <div className="flex flex-col gap-3.5 p-4">
            <Field
              label={t.protocol}
              hint={ENCRYPTED_PROTOCOLS.has(l.protocol) ? t.encrypted : l.protocol === "internal" ? t.internalCall : <span className="text-red">{t.plaintext}</span>}
            >
              <Select value={l.protocol} onChange={(e) => patch({ protocol: e.target.value as Protocol })} className="font-mono text-xs">
                <optgroup label={t.encryptedGroup}>
                  {encrypted.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </optgroup>
                <optgroup label={t.plainGroup}>
                  {plain.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </optgroup>
                <option value="internal">{t.internalOption}</option>
              </Select>
            </Field>
            <Field label={t.exchangedData}>
              <Select value={l.sensitivity ?? ""} onChange={(e) => patch({ sensitivity: (e.target.value || undefined) as typeof l.sensitivity })}>
                <option value="">{t.unspecified}</option>
                {SENSITIVITY.map((s) => (
                  <option key={s} value={s}>
                    {t.sensitivity[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.label}>
              <Input value={l.label ?? ""} placeholder={t.labelPlaceholder} onChange={(e) => patch({ label: e.target.value || undefined })} />
            </Field>
          </div>
          <IssueList issues={issues.get(selection.id) ?? []} />
        </Panel>
      );
    }
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface max-lg:hidden" aria-label={t.inspector}>
      <div className="min-h-0 flex-1 overflow-y-auto">{body ?? <Overview report={report} go={go} />}</div>
      {body && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <span className="text-[11px] text-fg-3">
            <kbd className="font-mono">{t.deleteKey}</kbd>
            {t.toRemove}
          </span>
          <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={onDelete} className="text-red hover:text-red">
            {t.delete}
          </Button>
        </div>
      )}
    </aside>
  );
}

function Panel({ icon, kicker, title, children }: { icon: ReactNode; kicker: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="animate-[rise_160ms_ease-out]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <span className="grid size-8 place-items-center rounded-md border border-line bg-surface-2 text-fg-2">{icon}</span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">{kicker}</p>
          <p className="truncate text-[14px] font-medium leading-tight">{title}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ComponentPanel({ c, spec, set, issues, onRenamed }: { c: Component; spec: Spec; set: (fn: (s: Spec) => Spec) => void; issues: Issue[]; onRenamed: (id: string) => void }) {
  const t = useMessages(inspectorMessages);
  const { KINDS, COUNTRIES } = useCatalog();
  const Icon = KIND_ICON[c.kind];
  const info = KINDS[c.kind];
  const tech = parseTech(c.tech);
  const runtime = parseTech(c.runtime);
  const patch = (p: Partial<Component>) => set((s) => updateComponent(s, c.id, p));
  const g = buildGraph(spec);
  const autoExposure = g.exposure({ ...c, exposure: undefined });
  const [idDraft, setIdDraft] = useState(c.id);
  const [idError, setIdError] = useState<string>();
  useEffect(() => setIdDraft(c.id), [c.id]);

  const commitId = () => {
    const next = renameElement(spec, c.id, idDraft.trim());
    if (next === "invalid") return setIdError(t.idInvalid);
    if (next === "taken") return setIdError(t.idTaken);
    setIdError(undefined);
    set(() => next);
    onRenamed(idDraft.trim());
  };

  const join = (name?: string, version?: string) => (name ? (version ? `${name}@${version}` : name) : undefined);

  return (
    <Panel icon={<Icon size={14} strokeWidth={1.75} />} kicker={info.label} title={c.name ?? c.id}>
      <div className="flex flex-col gap-3.5 p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t.name}>
            <Input value={c.name ?? ""} placeholder={c.id} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label={t.identifier} hint={idError ? <span className="text-red">{idError}</span> : undefined}>
            <Input mono value={idDraft} onChange={(e) => setIdDraft(e.target.value)} onBlur={commitId} onKeyDown={(e) => e.key === "Enter" && commitId()} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_84px] gap-2.5">
          <Field label={t.technology}>
            <Input mono list={`techs-${c.kind}`} value={tech?.name ?? ""} placeholder={info.techs[0] ?? t.techPlaceholder} onChange={(e) => patch({ tech: join(e.target.value.trim().toLowerCase(), tech?.version) })} />
          </Field>
          <Field label={t.version}>
            <Input mono value={tech?.version ?? ""} placeholder="17" onChange={(e) => patch({ tech: join(tech?.name, e.target.value.trim()) })} disabled={!tech?.name} />
          </Field>
        </div>
        <datalist id={`techs-${c.kind}`}>
          {info.techs.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {["frontend", "backend", "api"].includes(c.kind) && (
          <div className="grid grid-cols-[1fr_84px] gap-2.5">
            <Field label={t.runtime}>
              <Input mono list="runtimes" value={runtime?.name ?? ""} placeholder="nodejs" onChange={(e) => patch({ runtime: join(e.target.value.trim().toLowerCase(), runtime?.version) })} />
            </Field>
            <Field label={t.version}>
              <Input mono value={runtime?.version ?? ""} placeholder="22" onChange={(e) => patch({ runtime: join(runtime?.name, e.target.value.trim()) })} disabled={!runtime?.name} />
            </Field>
            <datalist id="runtimes">
              {["nodejs", "php", "python", "ruby", "dotnet", "java", "go", "bun", "deno"].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        )}
        {info.exposure !== "managed" && (
          <Field label={t.exposure}>
            <div className="grid grid-cols-3 rounded-md border border-line-strong p-0.5" role="radiogroup">
              {([undefined, "public", "private"] as const).map((v) => (
                <button
                  key={v ?? "auto"}
                  role="radio"
                  aria-checked={c.exposure === v}
                  onClick={() => patch({ exposure: v })}
                  className={cx("h-7 rounded-[5px] text-xs transition-colors", c.exposure === v ? "bg-sunken font-medium text-fg" : "text-fg-3 hover:text-fg")}
                >
                  {v === undefined ? t.auto(autoExposure === "public") : v === "public" ? t.public : t.private}
                </button>
              ))}
            </div>
          </Field>
        )}
        <SectionTitle className="pt-1">{t.hosting}</SectionTitle>
        {spec.zones.length > 0 && (
          <Field label={t.zone}>
            <Select value={c.zone ?? ""} onChange={(e) => patch({ zone: e.target.value || undefined })}>
              <option value="">{t.none}</option>
              {spec.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name ?? z.id} {z.country ? `(${z.country})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t.provider}>
            <Input
              value={c.hosting?.provider ?? ""}
              placeholder={g.provider(c) ?? "ovh, scaleway…"}
              onChange={(e) => patch({ hosting: { ...c.hosting, provider: e.target.value } })}
            />
          </Field>
          <Field label={t.country}>
            <Select value={c.hosting?.country ?? ""} onChange={(e) => patch({ hosting: { ...c.hosting, country: e.target.value || undefined } })}>
              <option value="">{g.country(c) ? t.zoneCountry(g.country(c)!) : t.unspecified}</option>
              {Object.entries(COUNTRIES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t.notes}>
          <Textarea value={c.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} placeholder={t.notesPlaceholder} />
        </Field>
      </div>
      <IssueList issues={issues} />
    </Panel>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  const t = useMessages(inspectorMessages);
  if (!issues.length) {
    return (
      <div className="mx-4 mb-4 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-xs text-fg-2">
        <StatusIcon status="pass" size={13} />
        {t.noIssue}
      </div>
    );
  }
  return (
    <div className="border-t border-line px-4 py-3.5">
      <SectionTitle>{t.findings(issues.length)}</SectionTitle>
      <ul className="mt-2.5 flex flex-col gap-2">
        {issues.map((i, n) => (
          <li key={n} className="rounded-md border border-line bg-surface-2 p-2.5">
            <div className="flex items-start gap-2">
              <StatusIcon status={i.status} size={13} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-snug">{i.message}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <SeverityTag severity={i.severity} />
                  <span className="truncate font-mono text-[10.5px] text-fg-3">{i.ruleId}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview({ report, go }: { report: Report; go: WorkspaceProps["go"] }) {
  const t = useMessages(inspectorMessages);
  const { lang } = useLang();
  const blockers = report.results.filter((r) => r.blocking);
  const next = report.results
    .filter((r) => !r.blocking && (r.status === "fail" || r.status === "evidence") && r.severity === "major")
    .slice(0, 4);
  return (
    <div className="animate-[rise_160ms_ease-out]">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between">
          <VerdictPill decision={report.verdict.decision} />
          <span className="font-mono text-[10.5px] text-fg-3">{t.threshold(report.threshold)}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ScoreGauge value={report.score.global} threshold={report.threshold} size={56} />
          <p className="text-[12.5px] leading-snug text-fg-2">{report.verdict.reasons.join(" ")}</p>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          {Object.entries(report.score.byCategory).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_88px_26px] items-center gap-2 text-xs">
              <span className="text-fg-2">{categoryLabels(lang)[k as keyof ReturnType<typeof categoryLabels>]}</span>
              <span className="h-1 overflow-hidden rounded-full bg-sunken">
                <span className={cx("block h-full rounded-full", v! >= 80 ? "bg-go" : v! >= 50 ? "bg-amber" : "bg-red")} style={{ width: `${v}%` }} />
              </span>
              <span className="tnum text-right text-fg-2">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4">
        <SectionTitle aside={<button onClick={() => go("checks")} className="text-[11.5px] text-fg-3 hover:text-fg">{t.seeAll}</button>}>
          {t.blockers(blockers.length)}
        </SectionTitle>
        {blockers.length === 0 ? (
          <p className="mt-2 text-xs text-fg-3">{t.noBlocker}</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {blockers.map((r) => (
              <li key={r.ruleId}>
                <button onClick={() => go("checks", r.ruleId)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sunken">
                  <StatusIcon status={r.status} size={13} className="mt-0.5" />
                  <span className="text-[12.5px] leading-snug">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {next.length > 0 && (
          <>
            <SectionTitle className="mt-5">{t.next}</SectionTitle>
            <ul className="mt-2 flex flex-col">
              {next.map((r) => (
                <li key={r.ruleId}>
                  <button onClick={() => go("checks", r.ruleId)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sunken">
                    <StatusIcon status={r.status} size={13} className="mt-0.5" />
                    <span className="text-[12.5px] leading-snug text-fg-2">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-6 border-t border-line pt-3 text-[11.5px] leading-relaxed text-fg-3">
          {t.help}
        </p>
      </div>
    </div>
  );
}
