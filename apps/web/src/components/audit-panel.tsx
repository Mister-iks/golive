"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { History, Radar, ScanSearch, ShieldAlert } from "lucide-react";
import type { Report } from "@golive/engine";
import { api, ApiError } from "@/lib/api";
import { ago } from "@/lib/format";
import { useStore, type Audit, type Project } from "@/lib/store";
import { useMe } from "@/lib/use-report";
import { useLang, useMessages } from "@/i18n/client";
import { auditMessages } from "@/i18n/messages/audit";
import { Button, cx, Input, labels, Popover, Select, Tip, useLabels } from "./ui";

type Env = "prod" | "preprod";

export function AuditPanel({ project, report }: { project: Project; report: Report }) {
  const t = useMessages(auditMessages);
  const { me } = useMe();
  const update = useStore((s) => s.update);
  const startAudit = useStore((s) => s.startAudit);
  const targets = project.spec.targets ?? {};
  const [env, setEnv] = useState<Env>(targets.prod ? "prod" : targets.preprod ? "preprod" : "prod");
  const [error, setError] = useState<{ text: string; host?: string }>();
  const url = targets[env] ?? "";
  const running = project.audits.find((a) => a.status === "queued" || a.status === "running");
  const web = project.web;
  const canRun = project.rights.contribute;

  useAuditPolling(project.id, running);

  const setUrl = (value: string) =>
    update(project.id, (s) => {
      const t = { ...(s.targets ?? {}) };
      if (value) t[env] = value;
      else delete t[env];
      return { ...s, targets: t };
    });

  const run = async (kind: "quick" | "full") => {
    setError(undefined);
    try {
      await startAudit(project.id, env, kind);
    } catch (e) {
      const err = e as ApiError;
      let host: string | undefined;
      try {
        host = new URL(url).hostname;
      } catch {}
      setError({ text: err.message, host: err.code === "domain_unverified" ? host : undefined });
    }
  };

  const layers: { n: number; label: string; state: "on" | "off" | "cli" | "premium"; hint: string }[] = [
    { n: 1, label: t.layers[1].label, state: "on", hint: t.layers[1].hint },
    { n: 2, label: t.layers[2].label, state: "cli", hint: t.layers[2].hint },
    {
      n: 3,
      label: t.layers[3].label,
      state: report.coverage.layers.includes(3) ? "on" : "off",
      hint: web?.crawl ? t.fullAuditHint(web.crawl.pages.length) : web ? t.quickAuditHint : t.notAudited,
    },
    { n: 4, label: t.layers[4].label, state: "premium", hint: t.layers[4].hint },
  ];

  return (
    <div className="shrink-0 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <ol className="flex items-center gap-1" aria-label={t.layerCoverage}>
          {layers.map((l) => (
            <Tip key={l.n} label={l.hint} side="bottom">
              <li
                className={cx(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
                  l.state === "on" && "border-go-line bg-go-soft text-go-ink",
                  l.state === "off" && "border-line-strong text-fg-2",
                  (l.state === "cli" || l.state === "premium") && "border-dashed border-line text-fg-4",
                )}
              >
                <span className="font-mono text-[10.5px]">{l.n}</span>
                <span className="max-lg:hidden">{l.label}</span>
                {l.state === "premium" && <span className="font-mono text-[9.5px] uppercase">Pro</span>}
                {l.state === "cli" && <span className="font-mono text-[9.5px] uppercase">CLI</span>}
              </li>
            </Tip>
          ))}
        </ol>
        <form
          className="flex w-full items-center gap-2 2xl:ml-auto 2xl:w-auto 2xl:max-w-[760px] 2xl:flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (url && canRun && !running) void run("full");
          }}
        >
          <div className="w-[124px] shrink-0">
            <Select value={env} onChange={(e) => setEnv(e.target.value as Env)} aria-label={t.environment}>
              <option value="prod">{t.production}</option>
              <option value="preprod">{t.preprod}</option>
            </Select>
          </div>
          <Input
            mono
            type="url"
            required
            placeholder="https://example.com"
            value={url}
            disabled={!project.rights.edit}
            onChange={(e) => setUrl(e.target.value.trim())}
            aria-label={t.urlOf(env === "prod")}
          />
          <Tip label={t.quickHint}>
            <Button type="button" icon={<Radar size={14} />} disabled={!url || !canRun || !!running} onClick={() => void run("quick")}>
              {t.quick}
            </Button>
          </Tip>
          <Tip label={t.fullHint(me?.settings.maxPages ?? 20)}>
            <Button type="submit" variant="primary" icon={<ScanSearch size={14} />} disabled={!url || !canRun || !!running}>
              {t.full}
            </Button>
          </Tip>
          <AuditHistory audits={project.audits} />
        </form>
      </div>

      {running ? (
        <RunningAudit audit={running} />
      ) : error ? (
        <div className="flex items-center justify-between gap-4 border-t border-red-line bg-red-soft px-5 py-2 text-xs text-red-ink">
          <span className="flex items-center gap-2">
            <ShieldAlert size={13} />
            {error.text}
          </span>
          {error.host && (
            <Link href={`/settings?tab=domains&host=${encodeURIComponent(error.host)}`} className="shrink-0 font-medium underline underline-offset-2">
              {t.verifyDomain}
            </Link>
          )}
        </div>
      ) : (
        web && <LastAudit project={project} />
      )}
    </div>
  );
}

function RunningAudit({ audit }: { audit: Audit }) {
  const t = useMessages(auditMessages);
  const p = audit.progress;
  const pct = audit.status === "queued" ? 4 : p.step === "probe" ? 10 : p.step === "crawl" && p.maxPages ? 12 + Math.round(((p.pages ?? 0) / p.maxPages) * 80) : p.step === "lighthouse" ? 92 : p.step === "evaluate" ? 96 : 8;
  return (
    <div className="border-t border-line px-5 py-2.5">
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="flex items-center gap-2 text-fg-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-go opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-go" />
          </span>
          {audit.status === "queued" ? t.queued : t.steps[p.step ?? ""] ?? t.running}
          {p.step === "crawl" && p.maxPages ? <span className="tnum font-mono text-fg-3">{t.pages(p.pages ?? 0, p.maxPages)}</span> : null}
        </span>
        <span className="truncate font-mono text-fg-3">{audit.url}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-go transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LastAudit({ project }: { project: Project }) {
  const t = useMessages(auditMessages);
  const { lang } = useLang();
  const web = project.web!;
  const clearWeb = useStore((s) => s.clearWeb);
  const notify = useStore((s) => s.notify);
  const crawl = web.crawl;
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-2 text-xs text-fg-3">
      <span className="truncate">
        {crawl ? t.lastFull : t.lastQuick} {t.of} <span className="font-mono text-fg-2">{web.finalUrl}</span> · {web.env === "prod" ? t.envProd : t.envPreprod} ·{" "}
        {ago(web.fetchedAt, lang)} · HTTP {web.status}
        {crawl ? ` · ${t.crawled(crawl.pages.length, Math.round(crawl.durationMs / 1000))}` : ` · ${web.timing.totalMs} ms`}
        {crawl?.truncated ? ` · ${t.pageLimit}` : ""}
      </span>
      {project.rights.contribute && (
        <button onClick={() => clearWeb(project.id, web.env).catch((e: Error) => notify(e.message))} className="shrink-0 hover:text-fg">
          {t.clear}
        </button>
      )}
    </div>
  );
}

function AuditHistory({ audits }: { audits: Audit[] }) {
  const t = useMessages(auditMessages);
  const { lang } = useLang();
  const decision = useLabels().decision as Record<string, string>;
  const done = audits.filter((a) => a.status === "done" || a.status === "failed");
  if (!done.length) return null;
  return (
    <Popover
      width={380}
      trigger={
        <Button type="button" variant="ghost" icon={<History size={14} />} aria-label={t.history}>
          <span className="sr-only">{t.historyShort}</span>
        </Button>
      }
    >
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-3">{t.recent}</p>
      <ul className="flex flex-col gap-1.5">
        {done.slice(0, 10).map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-xs">
            <span className={cx("w-[86px] shrink-0 font-medium", a.status === "failed" ? "text-red-ink" : a.verdict === "go" ? "text-go-ink" : a.verdict === "conditional" ? "text-amber-ink" : "text-red-ink")}>
              {a.status === "failed" ? t.failed : `${decision[a.verdict ?? ""] ?? a.verdict} · ${a.score}`}
            </span>
            <span className="w-[54px] shrink-0 text-fg-3">{a.kind === "full" ? t.kindFull : t.kindQuick}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-2" title={a.error ?? a.url}>
              {a.status === "failed" ? a.error : a.url}
            </span>
            <span className="shrink-0 text-fg-4">{ago(a.createdAt, lang)}</span>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

/** Follows a running audit, then reloads the project with its new observation and tasks. */
function useAuditPolling(projectId: string, running: Audit | undefined) {
  const { lang } = useLang();
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const a = await api<Audit>(`/audits/${running.id}`);
        if (!alive) return;
        const st = useStore.getState();
        const p = st.projects[projectId];
        if (p) useStore.setState({ projects: { ...st.projects, [projectId]: { ...p, audits: p.audits.map((x) => (x.id === a.id ? a : x)) } } });
        if (a.status === "done" || a.status === "failed") {
          await st.loadProject(projectId);
          const t = auditMessages[lang];
          const decision = labels(lang).decision as Record<string, string>;
          st.notify(a.status === "done" ? t.done(decision[a.verdict ?? ""] ?? a.verdict ?? "", a.score) : t.doneFailed(a.error), a.status === "done" ? "info" : "error");
          return;
        }
      } catch {}
      setTimeout(tick, 1500);
    };
    const t = setTimeout(tick, 1000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [projectId, running?.id]);
}
