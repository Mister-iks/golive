"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink, Radar, Scale, ShieldCheck, Undo2 } from "lucide-react";
import { CATEGORY_LABELS, COMMUNITY_PACKS, type Report, type RuleResult } from "@golive/engine";
import type { Category, Status, WebObservation } from "@golive/packs-sdk";
import type { Spec } from "@golive/spec";
import { useStore } from "@/lib/store";
import { ago, longDate } from "@/lib/format";
import { today } from "@/lib/use-report";
import { Button, cx, Dialog, Empty, Field, Input, Select, SeverityTag, StatusIcon, STATUS_LABEL, Textarea, Tip } from "./ui";
import type { WorkspaceProps } from "./workspace";

type Filter = "open" | "blocking" | "evidence" | "pass" | "not-run" | "all";

const FILTERS: { id: Filter; label: string; test: (r: RuleResult) => boolean }[] = [
  { id: "open", label: "À traiter", test: (r) => r.status === "fail" || r.status === "evidence" || r.status === "warn" },
  { id: "blocking", label: "Bloquants", test: (r) => r.blocking },
  { id: "evidence", label: "Preuves requises", test: (r) => r.status === "evidence" },
  { id: "pass", label: "Réussis", test: (r) => r.status === "pass" },
  { id: "not-run", label: "Non exécutés", test: (r) => r.status === "not-run" },
  { id: "all", label: "Toutes les règles", test: (r) => r.status !== "na" },
];

const STATUS_ORDER: Status[] = ["fail", "evidence", "warn", "not-run", "pass", "na"];
const SEV_ORDER = { blocker: 0, major: 1, minor: 2, info: 3 };
const PACK_NAME = Object.fromEntries(COMMUNITY_PACKS.map((p) => [p.id, p.name]));

export function Checks({ project, report }: WorkspaceProps) {
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
      <Coverage project={project} report={report} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-line bg-surface px-2 py-3 max-md:hidden">
          <p className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">Statut</p>
          {FILTERS.map((f) => (
            <FilterItem key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} count={report.results.filter(f.test).length}>
              {f.label}
            </FilterItem>
          ))}
          <p className="px-2 pb-1 pt-5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-3">Catégorie</p>
          <FilterItem active={category === "all"} onClick={() => setCategory("all")}>
            Toutes
          </FilterItem>
          {categories.map((c) => (
            <FilterItem key={c} active={category === c} onClick={() => setCategory(c)} count={report.score.byCategory[c]} countSuffix="">
              {CATEGORY_LABELS[c]}
            </FilterItem>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <Empty icon={<ShieldCheck size={16} />} title={filter === "open" ? "Rien à traiter" : "Aucune règle ici"}>
              {filter === "open" ? "Tous les contrôles applicables sont au vert." : "Changez de filtre pour voir d'autres règles."}
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

/* ----------------------------------------------------------- Coverage */

function Coverage({ project, report }: { project: WorkspaceProps["project"]; report: Report }) {
  const setWeb = useStore((s) => s.setWeb);
  const targets = project.spec.targets;
  const [url, setUrl] = useState(targets.prod ?? targets.preprod ?? "");
  const [env, setEnv] = useState<"prod" | "preprod">(targets.prod ? "prod" : targets.preprod ? "preprod" : "prod");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const web = project.web;

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, env }) });
      const data = (await res.json()) as WebObservation & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setWeb(project.id, data);
      if (!data.ok) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const layers: { n: number; label: string; state: "on" | "off" | "soon" | "premium"; hint: string }[] = [
    { n: 1, label: "Architecture déclarée", state: "on", hint: "Évaluée en continu depuis le Studio et la fiche." },
    { n: 2, label: "Code et infrastructure", state: "soon", hint: "Scanners de dépôt (OSV-Scanner, Gitleaks, Trivy) : prochaine version." },
    { n: 3, label: "Site en ligne", state: report.coverage.layers.includes(3) ? "on" : "off", hint: "Audit passif de l'URL déclarée." },
    { n: 4, label: "Analyse IA", state: "premium", hint: "Disponible dans l'édition Premium." },
  ];

  return (
    <div className="shrink-0 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <ol className="flex items-center gap-1" aria-label="Couches de vérification">
          {layers.map((l) => (
            <Tip key={l.n} label={l.hint} side="bottom">
              <li
                className={cx(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
                  l.state === "on" && "border-go-line bg-go-soft text-go",
                  l.state === "off" && "border-line-strong text-fg-2",
                  (l.state === "soon" || l.state === "premium") && "border-dashed border-line text-fg-4",
                )}
              >
                <span className="font-mono text-[10.5px]">{l.n}</span>
                <span className="max-lg:hidden">{l.label}</span>
                {l.state === "premium" && <span className="font-mono text-[9.5px] uppercase">Pro</span>}
              </li>
            </Tip>
          ))}
        </ol>
        <form
          className="ml-auto flex min-w-[380px] flex-1 items-center gap-2 lg:max-w-[560px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (url) void run();
          }}
        >
          <div className="w-[124px] shrink-0">
            <Select value={env} onChange={(e) => setEnv(e.target.value as "prod" | "preprod")} aria-label="Environnement">
              <option value="prod">Production</option>
              <option value="preprod">Pré-prod</option>
            </Select>
          </div>
          <Input mono type="url" required placeholder="https://exemple.sn" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL à auditer" />
          <Button type="submit" variant="primary" icon={<Radar size={14} className={busy ? "animate-spin" : ""} />} disabled={busy || !url}>
            {busy ? "Audit…" : "Auditer"}
          </Button>
        </form>
      </div>
      {(web || error) && (
        <div className={cx("flex items-center justify-between gap-4 border-t px-5 py-2 text-xs", error ? "border-red-line bg-red-soft text-red" : "border-line text-fg-3")}>
          {error ? (
            <span>{error}</span>
          ) : (
            web && (
              <span className="truncate">
                Dernier audit <span className="font-mono text-fg-2">{web.finalUrl}</span> · {web.env === "prod" ? "production" : "pré-production"} · {ago(web.fetchedAt)} · HTTP {web.status} ·{" "}
                {web.timing.totalMs} ms
              </span>
            )
          )}
          {web && (
            <button onClick={() => setWeb(project.id, undefined)} className="shrink-0 hover:text-fg">
              Effacer l'audit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Rule row */

function RuleRow({ r, project, expanded, onToggle }: { r: RuleResult; project: WorkspaceProps["project"]; expanded: boolean; onToggle: () => void }) {
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
            {r.waiver && <span className="shrink-0 rounded border border-amber-line px-1 font-mono text-[9.5px] uppercase text-amber">dérogation</span>}
            {r.attested && <span className="shrink-0 rounded border border-go-line px-1 font-mono text-[9.5px] uppercase text-go">attesté</span>}
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
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">Correction</p>
              <p className="mt-1 text-[13px] leading-relaxed">{r.fix}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-fg-3">Pack</dt>
              <dd>{PACK_NAME[r.packId]}</dd>
              <dt className="text-fg-3">Couche</dt>
              <dd>{r.layer}</dd>
              <dt className="text-fg-3">Statut</dt>
              <dd>{STATUS_LABEL[r.status]}</dd>
              <dt className="text-fg-3">Source</dt>
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
              <Scale size={13} /> Exigence légale signalée par GoLive, à valider par un juriste. GoLive ne délivre pas d'avis juridique.
            </p>
          )}

          {r.attested && (
            <p className="mt-4 max-w-3xl text-xs text-fg-2">
              Attesté par <strong className="font-medium">{r.attested.by}</strong> le {longDate(r.attested.date)}
              {r.attested.note ? ` : ${r.attested.note}` : "."}
            </p>
          )}
          {r.waiver && (
            <p className="mt-4 max-w-3xl text-xs text-fg-2">
              Dérogation signée par <strong className="font-medium">{r.waiver.owner}</strong> jusqu'au {longDate(r.waiver.expires)} : {r.waiver.reason}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {r.status === "evidence" && !r.attested && (
              <Button size="sm" variant="primary" icon={<ShieldCheck size={13} />} onClick={() => setDialog("attest")}>
                Attester
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
                Retirer l'attestation
              </Button>
            )}
            {(r.blocking || r.waiver) && !r.waiver && (
              <Button size="sm" icon={<Scale size={13} />} onClick={() => setDialog("waive")}>
                Déroger
              </Button>
            )}
            {r.waiver && (
              <Button size="sm" icon={<Undo2 size={13} />} onClick={() => set((s) => ({ ...s, waivers: s.waivers.filter((w) => w.rule !== r.ruleId) }))}>
                Lever la dérogation
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Attester ce contrôle" description={r.title} width={500}>
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
          <Field label="Attesté par">
            <Input required autoFocus value={by} onChange={(e) => setBy(e.target.value)} placeholder="Nom et fonction" />
          </Field>
          <Field label="Date">
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
          </Field>
        </div>
        <Field label="Lien vers la preuve" hint="Document, ticket, capture… L'attestation est enregistrée dans le golive.yaml.">
          <Input mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Commentaire">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={!by.trim()}>
            Enregistrer l'attestation
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Signer une dérogation" description={r.title} width={520}>
      <form
        className="flex flex-col gap-3.5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ rule: r.ruleId, owner: owner.trim(), expires, reason: reason.trim(), plan: plan.trim() || undefined });
        }}
      >
        <p className="rounded-md border border-amber-line bg-amber-soft px-3 py-2 text-xs leading-relaxed text-amber">
          Une dérogation transforme ce bloquant en Go conditionnel jusqu'à sa date d'échéance. Elle est nominative et visible dans le rapport.
        </p>
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <Field label="Valideur">
            <Input required autoFocus value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Nom et fonction" />
          </Field>
          <Field label="Échéance">
            <Input required type="date" value={expires} min={today()} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
        <Field label="Motif">
          <Textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pourquoi mettre en ligne malgré ce bloquant ?" />
        </Field>
        <Field label="Plan de correction">
          <Textarea value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Qui corrige, comment, quand." />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={!owner.trim() || !reason.trim()}>
            Signer la dérogation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
