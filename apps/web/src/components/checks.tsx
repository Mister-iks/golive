"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink, Scale, ShieldCheck, Undo2 } from "lucide-react";
import { categoryLabels, COMMUNITY_PACKS, type RuleResult } from "@golive/engine";
import type { Category, Status } from "@golive/packs-sdk";
import type { Spec } from "@golive/spec";
import { useStore } from "@/lib/store";
import { longDate } from "@/lib/format";
import { today } from "@/lib/use-report";
import { useLang, useMessages } from "@/i18n/client";
import { checksMessages } from "@/i18n/messages/checks";
import { Button, cx, Dialog, Empty, Field, Input, SeverityTag, StatusIcon, Textarea, useLabels } from "./ui";
import { AuditPanel } from "./audit-panel";
import type { WorkspaceProps } from "./workspace";

type Filter = "open" | "blocking" | "evidence" | "pass" | "not-run" | "all";

const FILTERS: { id: Filter; test: (r: RuleResult) => boolean }[] = [
  { id: "open", test: (r) => r.status === "fail" || r.status === "evidence" || r.status === "warn" },
  { id: "blocking", test: (r) => r.blocking },
  { id: "evidence", test: (r) => r.status === "evidence" },
  { id: "pass", test: (r) => r.status === "pass" },
  { id: "not-run", test: (r) => r.status === "not-run" },
  { id: "all", test: (r) => r.status !== "na" },
];

const STATUS_ORDER: Status[] = ["fail", "evidence", "warn", "not-run", "pass", "na"];
const SEV_ORDER = { blocker: 0, major: 1, minor: 2, info: 3 };
const packName = (id: string, lang: string) => {
  const p = COMMUNITY_PACKS.find((x) => x.id === id);
  return p ? (lang === "fr" && p.fr?.name) || p.name : id;
};

export function Checks({ project, report }: WorkspaceProps) {
  const t = useMessages(checksMessages);
  const { lang } = useLang();
  const [filter, setFilter] = useState<Filter>("open");
  const [category, setCategory] = useState<Category | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && report.results.some((r) => r.ruleId === hash)) {
      setOpen(hash);
      setFilter("all");
      requestAnimationFrame(() => document.getElementById(`rule-${hash}`)?.scrollIntoView({ block: "center" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    return report.results
      .filter((r) => f.test(r) && (category === "all" || r.category === category))
      .sort((a, b) => Number(b.blocking) - Number(a.blocking) || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  }, [report, filter, category]);

  const categories = [...new Set(report.results.filter((r) => r.status !== "na").map((r) => r.category))];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AuditPanel project={project} report={report} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-line bg-surface px-2 py-3 max-md:hidden">
          <p className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">{t.status}</p>
          {FILTERS.map((f) => (
            <FilterItem key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} count={report.results.filter(f.test).length}>
              {t.filters[f.id]}
            </FilterItem>
          ))}
          <p className="px-2 pb-1 pt-5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">{t.category}</p>
          <FilterItem active={category === "all"} onClick={() => setCategory("all")}>
            {t.allCategories}
          </FilterItem>
          {categories.map((c) => (
            <FilterItem key={c} active={category === c} onClick={() => setCategory(c)} count={report.score.byCategory[c]} countSuffix="">
              {categoryLabels(lang)[c]}
            </FilterItem>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <Empty icon={<ShieldCheck size={16} />} title={filter === "open" ? t.nothingOpen : t.noRules}>
              {filter === "open" ? t.allGreen : t.changeFilter}
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <RuleRow key={r.ruleId} r={r} project={project} expanded={open === r.ruleId} onToggle={() => setOpen(open === r.ruleId ? null : r.ruleId)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterItem({ active, onClick, count, countSuffix, children }: { active: boolean; onClick: () => void; count?: number; countSuffix?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx("flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[13px]", active ? "bg-sunken font-medium text-fg" : "text-fg-2 hover:bg-sunken/70 hover:text-fg")}
    >
      {children}
      {count !== undefined && (
        <span className="tnum font-mono text-[11px] text-fg-3">
          {count}
          {countSuffix}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------- Rule row */

function RuleRow({ r, project, expanded, onToggle }: { r: RuleResult; project: WorkspaceProps["project"]; expanded: boolean; onToggle: () => void }) {
  const t = useMessages(checksMessages);
  const { lang } = useLang();
  const labels = useLabels();
  const update = useStore((s) => s.update);
  const [dialog, setDialog] = useState<"attest" | "waive" | null>(null);
  const set = (fn: (s: Spec) => Spec) => update(project.id, fn);
  const visible = r.findings.filter((f) => f.status !== "pass" || r.status === "pass");

  return (
    <li id={`rule-${r.ruleId}`} className={cx(expanded && "bg-surface")}>
      <button onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface">
        <StatusIcon status={r.status} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <span className="truncate">{r.title}</span>
            {r.waiver && <span className="shrink-0 rounded border border-amber-line px-1 font-mono text-[9.5px] uppercase text-amber-ink">{t.waiverTag}</span>}
            {r.attested && <span className="shrink-0 rounded border border-go-line px-1 font-mono text-[9.5px] uppercase text-go-ink">{t.attestedTag}</span>}
          </p>
          <p className="truncate text-xs text-fg-3">{visible[0]?.message ?? r.why}</p>
        </div>
        <span className="hidden shrink-0 font-mono text-[10.5px] text-fg-3 xl:block">{r.ruleId}</span>
        <SeverityTag severity={r.severity} className="w-[62px] justify-center" />
        <ChevronRight size={14} className={cx("shrink-0 text-fg-4 transition-transform", expanded && "rotate-90")} />
      </button>

      {expanded && (
        <div className="animate-[rise_140ms_ease-out] px-5 pb-5 pl-12">
          <p className="max-w-3xl text-[13px] leading-relaxed text-fg-2">{r.why}</p>

          {visible.length > 0 && (
            <ul className="mt-3 max-w-3xl divide-y divide-line overflow-hidden rounded-md border border-line">
              {visible.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 bg-surface-2 px-3 py-2">
                  <StatusIcon status={f.status} size={13} className="mt-0.5" />
                  <span className="flex-1 text-[12.5px]">{f.message}</span>
                  {f.observed && <span className="max-w-[40%] truncate font-mono text-[10.5px] text-fg-3">{f.observed}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-[1fr_220px]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">{t.fix}</p>
              <p className="mt-1 text-[13px] leading-relaxed">{r.fix}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-fg-3">{t.pack}</dt>
              <dd>{packName(r.packId, lang)}</dd>
              <dt className="text-fg-3">{t.layer}</dt>
              <dd>{r.layer}</dd>
              <dt className="text-fg-3">{t.status}</dt>
              <dd>{labels.status[r.status]}</dd>
              <dt className="text-fg-3">{t.source}</dt>
              <dd>
                {r.source.url ? (
                  <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-2 hover:decoration-fg">
                    {r.source.label}
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  r.source.label
                )}
              </dd>
            </dl>
          </div>

          {r.legal && (
            <p className="mt-4 flex max-w-3xl items-center gap-2 text-xs text-fg-3">
              <Scale size={13} /> {t.legal}
            </p>
          )}

          {r.attested && (
            <p className="mt-4 max-w-3xl text-xs text-fg-2">
              {t.attestedBy} <strong className="font-medium">{r.attested.by}</strong> {t.on} {longDate(r.attested.date, lang)}
              {r.attested.note ? ` : ${r.attested.note}` : "."}
            </p>
          )}
          {r.waiver && (
            <p className="mt-4 max-w-3xl text-xs text-fg-2">
              {t.waiverSignedBy} <strong className="font-medium">{r.waiver.owner}</strong> {t.until} {longDate(r.waiver.expires, lang)}
              {lang === "fr" ? " : " : ": "}
              {r.waiver.reason}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {r.status === "evidence" && !r.attested && (
              <Button size="sm" variant="primary" icon={<ShieldCheck size={13} />} onClick={() => setDialog("attest")}>
                {t.attest}
              </Button>
            )}
            {r.attested && (
              <Button
                size="sm"
                icon={<Undo2 size={13} />}
                onClick={() =>
                  set((s) => {
                    const { [r.ruleId]: _, ...evidence } = s.evidence;
                    return { ...s, evidence };
                  })
                }
              >
                {t.removeAttestation}
              </Button>
            )}
            {(r.blocking || r.waiver) && !r.waiver && (
              <Button size="sm" icon={<Scale size={13} />} onClick={() => setDialog("waive")}>
                {t.waive}
              </Button>
            )}
            {r.waiver && (
              <Button size="sm" icon={<Undo2 size={13} />} onClick={() => set((s) => ({ ...s, waivers: s.waivers.filter((w) => w.rule !== r.ruleId) }))}>
                {t.liftWaiver}
              </Button>
            )}
          </div>
        </div>
      )}

      <AttestDialog
        open={dialog === "attest"}
        onClose={() => setDialog(null)}
        r={r}
        onSave={(e) => {
          set((s) => ({ ...s, evidence: { ...s.evidence, [r.ruleId]: e } }));
          setDialog(null);
        }}
      />
      <WaiveDialog
        open={dialog === "waive"}
        onClose={() => setDialog(null)}
        r={r}
        onSave={(w) => {
          set((s) => ({ ...s, waivers: [...s.waivers.filter((x) => x.rule !== r.ruleId), w] }));
          setDialog(null);
        }}
      />
    </li>
  );
}

function AttestDialog({ open, onClose, r, onSave }: { open: boolean; onClose: () => void; r: RuleResult; onSave: (e: Spec["evidence"][string]) => void }) {
  const [by, setBy] = useState("");
  const [date, setDate] = useState(today());
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const t = useMessages(checksMessages);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t.attestTitle} description={r.title} width={500}>
      <form
        className="flex flex-col gap-3.5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ by: by.trim(), date, url: url.trim() || undefined, note: note.trim() || undefined });
        }}
      >
        <p className="rounded-md border border-blue-line bg-blue-soft px-3 py-2 text-xs leading-relaxed text-blue">
          {r.findings.find((f) => f.status === "evidence")?.message ?? r.why}
        </p>
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <Field label={t.attestedByField}>
            <Input required autoFocus value={by} onChange={(e) => setBy(e.target.value)} placeholder={t.namePlaceholder} />
          </Field>
          <Field label={t.date}>
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
          </Field>
        </div>
        <Field label={t.proofLink} hint={t.proofHint}>
          <Input mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label={t.comment}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={!by.trim()}>
            {t.saveAttestation}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function WaiveDialog({ open, onClose, r, onSave }: { open: boolean; onClose: () => void; r: RuleResult; onSave: (w: Spec["waivers"][number]) => void }) {
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [owner, setOwner] = useState("");
  const [expires, setExpires] = useState(in30);
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState("");
  const t = useMessages(checksMessages);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t.waiveTitle} description={r.title} width={520}>
      <form
        className="flex flex-col gap-3.5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ rule: r.ruleId, owner: owner.trim(), expires, reason: reason.trim(), plan: plan.trim() || undefined });
        }}
      >
        <p className="rounded-md border border-amber-line bg-amber-soft px-3 py-2 text-xs leading-relaxed text-amber-ink">
          {t.waiveNotice}
        </p>
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <Field label={t.signer}>
            <Input required autoFocus value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t.namePlaceholder} />
          </Field>
          <Field label={t.expires}>
            <Input required type="date" value={expires} min={today()} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
        <Field label={t.reason}>
          <Textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder} />
        </Field>
        <Field label={t.plan}>
          <Textarea value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={t.planPlaceholder} />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={!owner.trim() || !reason.trim()}>
            {t.signWaiver}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
