"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Copy, Download, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { ImportButton, NewProjectDialog, TemplateGrid } from "@/components/new-project";
import { PageHeader, Shell } from "@/components/shell";
import { MenuItem } from "@/components/menu";
import { Button, Dialog, ScoreGauge, VerdictPill } from "@/components/ui";
import { useCatalog, useLang, useMessages } from "@/i18n/client";
import { homeMessages } from "@/i18n/messages/home";
import { ago, exportYaml } from "@/lib/format";
import { useStore, type ProjectSummary } from "@/lib/store";
import { useMe } from "@/lib/use-report";

export default function Home() {
  const t = useMessages(homeMessages);
  const { org } = useMe();
  const rows = useStore((s) => s.list);
  const create = useStore((s) => s.create);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const canCreate = org && org.role !== "guest";

  useEffect(() => {
    if (org) useStore.getState().loadList().catch((e: Error) => useStore.getState().notify(e.message));
  }, [org?.id]);

  const start = async (template: string) => {
    try {
      router.push(`/p/${await create({ template })}`);
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    }
  };

  return (
    <Shell>
      <PageHeader title={t.title}>
        {canCreate && <ImportButton />}
        {canCreate && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
            {t.newProject}
          </Button>
        )}
      </PageHeader>

      <div className="flex-1 overflow-auto">
        {!rows ? null : rows.length === 0 ? (
          canCreate ? (
            <Onboarding onPick={(id) => void start(id)} />
          ) : (
            <p className="mx-auto mt-20 max-w-md text-center text-[13px] text-fg-3">{t.nothingShared}</p>
          )
        ) : (
          <div className="mx-auto max-w-[1180px] px-6 py-6">
            <Summary rows={rows} />
            <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-fg-3">
                    <th className="px-4 py-2.5 font-medium">{t.columns.project}</th>
                    <th className="px-3 py-2.5 font-medium max-lg:hidden">{t.columns.countries}</th>
                    <th className="px-3 py-2.5 font-medium">{t.columns.verdict}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t.columns.blockers}</th>
                    <th className="px-3 py-2.5 font-medium max-md:hidden">{t.columns.site}</th>
                    <th className="px-3 py-2.5 font-medium">{t.columns.score}</th>
                    <th className="px-3 py-2.5 font-medium max-lg:hidden">{t.columns.updated}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <Row key={p.id} p={p} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-fg-3">
              {t.exportHint.before}
              <span className="font-mono">golive.yaml</span>
              {t.exportHint.after}
              <span className="font-mono">golive check</span>.
            </p>
          </div>
        )}
      </div>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </Shell>
  );
}

function Summary({ rows }: { rows: ProjectSummary[] }) {
  const t = useMessages(homeMessages).stats;
  const go = rows.filter((x) => x.summary.decision === "go").length;
  const cond = rows.filter((x) => x.summary.decision === "conditional").length;
  const blockers = rows.reduce((n, x) => n + x.summary.blocking, 0);
  const audited = rows.filter((x) => x.summary.audited).length;
  const stats = [
    { label: t.projects, value: rows.length },
    { label: t.ready, value: go, tone: go ? "text-go" : undefined },
    { label: t.conditional, value: cond, tone: cond ? "text-amber" : undefined },
    { label: t.blockers, value: blockers, tone: blockers ? "text-red" : undefined },
    { label: t.audited, value: audited },
  ];
  return (
    <div className="grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-5 sm:divide-x">
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-3">
          <p className="text-[11px] text-fg-3">{s.label}</p>
          <p className={`tnum mt-0.5 text-xl font-semibold tracking-tight ${s.tone ?? ""}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function Row({ p }: { p: ProjectSummary }) {
  const t = useMessages(homeMessages);
  const { lang } = useLang();
  const { PROJECT_TYPE_LABELS } = useCatalog();
  const r = p.summary;
  const router = useRouter();
  const remove = useStore((s) => s.remove);
  const duplicate = useStore((s) => s.duplicate);
  const [confirm, setConfirm] = useState(false);
  const href = `/p/${p.id}`;

  return (
    <tr className="group cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => router.push(href)}>
      <td className="px-4 py-3">
        <Link href={href} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {p.spec.project.name}
        </Link>
        <p className="text-xs text-fg-3">
          {PROJECT_TYPE_LABELS[p.spec.project.type]} · {t.components(p.spec.components.length)}
        </p>
      </td>
      <td className="px-3 py-3 font-mono text-xs text-fg-2 max-lg:hidden">{p.spec.project.countries.join(" ") || "-"}</td>
      <td className="px-3 py-3">
        <VerdictPill decision={r.decision} size="sm" />
      </td>
      <td className={`tnum px-3 py-3 text-right ${r.blocking ? "font-medium text-red" : "text-fg-3"}`}>{r.blocking}</td>
      <td className="px-3 py-3 text-xs max-md:hidden">{r.audited ? <span className="text-fg-2">{t.audited}</span> : <span className="text-fg-4">{t.notAudited}</span>}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <ScoreGauge value={r.score} threshold={r.threshold} size={34} />
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-fg-3 max-lg:hidden">{ago(p.updatedAt, lang)}</td>
      <td className="pr-3" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" icon={<MoreHorizontal size={15} />} aria-label={t.actions} className="opacity-60 group-hover:opacity-100" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-pop">
              <MenuItem
                icon={<Copy size={14} />}
                onSelect={() =>
                  duplicate(p.id, p.spec)
                    .then((id) => id && router.push(`/p/${id}`))
                    .catch((e: Error) => useStore.getState().notify(e.message))
                }
              >
                {t.duplicate}
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onSelect={() => exportYaml(p.spec)}>
                {t.exportYaml}
              </MenuItem>
              {p.role === "responsable" && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-line" />
                  <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => setConfirm(true)}>
                    {t.delete}
                  </MenuItem>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Dialog open={confirm} onOpenChange={setConfirm} title={t.deleteTitle} description={t.deleteBody(p.spec.project.name)} width={440}>
          <div className="flex justify-end gap-2 px-5 py-4">
            <Button onClick={() => setConfirm(false)}>{t.cancel}</Button>
            <Button variant="danger" onClick={() => remove(p.id).catch((e: Error) => useStore.getState().notify(e.message))}>
              {t.delete}
            </Button>
          </div>
        </Dialog>
      </td>
    </tr>
  );
}

function Onboarding({ onPick }: { onPick: (id: string) => void }) {
  const t = useMessages(homeMessages).hero;
  return (
    <div className="mx-auto max-w-[1040px] px-6 pb-16 pt-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-go">PcyBox GoLive Community</p>
      <h2 className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">
        {t.line1}
        <br />
        {t.line2}
      </h2>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-2">{t.body}</p>
      <ol className="mt-8 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {t.steps.map(([n, title, d]) => (
          <li key={n} className="bg-surface px-4 py-3">
            <span className="font-mono text-[11px] text-fg-3">{n}</span>
            <p className="mt-1 text-[13px] font-medium">{title}</p>
            <p className="text-xs text-fg-3">{d}</p>
          </li>
        ))}
      </ol>
      <h3 className="mb-3 mt-12 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">{t.templates}</h3>
      <TemplateGrid onPick={onPick} />
    </div>
  );
}
