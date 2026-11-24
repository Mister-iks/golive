"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Copy, Download, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { evaluate, type Report } from "@golive/engine";
import { PROJECT_TYPE_LABELS } from "@golive/spec";
import { ImportButton, NewProjectDialog, TemplateGrid } from "@/components/new-project";
import { PageHeader, Shell } from "@/components/shell";
import { MenuItem } from "@/components/menu";
import { Button, Dialog, ScoreGauge, VerdictPill } from "@/components/ui";
import { ago, exportYaml } from "@/lib/format";
import { useStore, type Project } from "@/lib/store";
import { today, useHydrated } from "@/lib/use-report";

export default function Home() {
  const hydrated = useHydrated();
  const projects = useStore((s) => s.projects);
  const create = useStore((s) => s.create);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () =>
      Object.values(projects)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({ p, r: evaluate(p.spec, { web: p.web, asOf: today() }) })),
    [projects],
  );

  return (
    <Shell>
      <PageHeader title="Projets">
        <ImportButton />
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
          Nouveau projet
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto">
        {!hydrated ? null : rows.length === 0 ? (
          <Onboarding onPick={(t) => router.push(`/p/${create({ template: t })}`)} />
        ) : (
          <div className="mx-auto max-w-[1180px] px-6 py-6">
            <Summary rows={rows} />
            <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-fg-3">
                    <th className="px-4 py-2.5 font-medium">Projet</th>
                    <th className="px-3 py-2.5 font-medium max-lg:hidden">Pays</th>
                    <th className="px-3 py-2.5 font-medium">Verdict</th>
                    <th className="px-3 py-2.5 text-right font-medium">Bloquants</th>
                    <th className="px-3 py-2.5 text-right font-medium max-md:hidden">Preuves</th>
                    <th className="px-3 py-2.5 font-medium">Score</th>
                    <th className="px-3 py-2.5 font-medium max-lg:hidden">Modifié</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, r }) => (
                    <Row key={p.id} p={p} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-fg-3">
              Vos projets restent dans ce navigateur. Exportez le <span className="font-mono">golive.yaml</span> pour le versionner avec votre code et le vérifier en CI.
            </p>
          </div>
        )}
      </div>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </Shell>
  );
}

function Summary({ rows }: { rows: { p: Project; r: Report }[] }) {
  const go = rows.filter((x) => x.r.verdict.decision === "go").length;
  const cond = rows.filter((x) => x.r.verdict.decision === "conditional").length;
  const blockers = rows.reduce((n, x) => n + x.r.counts.blocking, 0);
  const proofs = rows.reduce((n, x) => n + x.r.counts.evidence, 0);
  const stats = [
    { label: "Projets", value: rows.length },
    { label: "Prêts (Go)", value: go, tone: go ? "text-go" : undefined },
    { label: "Go conditionnel", value: cond, tone: cond ? "text-amber" : undefined },
    { label: "Bloquants ouverts", value: blockers, tone: blockers ? "text-red" : undefined },
    { label: "Preuves à fournir", value: proofs },
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

function Row({ p, r }: { p: Project; r: Report }) {
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
          {PROJECT_TYPE_LABELS[p.spec.project.type]} · {p.spec.components.length} composant{p.spec.components.length > 1 ? "s" : ""}
        </p>
      </td>
      <td className="px-3 py-3 font-mono text-xs text-fg-2 max-lg:hidden">{p.spec.project.countries.join(" ") || "-"}</td>
      <td className="px-3 py-3">
        <VerdictPill decision={r.verdict.decision} size="sm" />
      </td>
      <td className={`tnum px-3 py-3 text-right ${r.counts.blocking ? "font-medium text-red" : "text-fg-3"}`}>{r.counts.blocking}</td>
      <td className="tnum px-3 py-3 text-right text-fg-2 max-md:hidden">{r.counts.evidence}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <ScoreGauge value={r.score.global} threshold={r.threshold} size={34} />
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-fg-3 max-lg:hidden">{ago(p.updatedAt)}</td>
      <td className="pr-3" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" icon={<MoreHorizontal size={15} />} aria-label="Actions" className="opacity-60 group-hover:opacity-100" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-pop">
              <MenuItem icon={<Copy size={14} />} onSelect={() => duplicate(p.id)}>
                Dupliquer
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onSelect={() => exportYaml(p.spec)}>
                Exporter golive.yaml
              </MenuItem>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => setConfirm(true)}>
                Supprimer
              </MenuItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Dialog open={confirm} onOpenChange={setConfirm} title="Supprimer ce projet ?" description={`« ${p.spec.project.name} » sera effacé de ce navigateur. Exportez-le d'abord si vous voulez le garder.`} width={440}>
          <div className="flex justify-end gap-2 px-5 py-4">
            <Button onClick={() => setConfirm(false)}>Annuler</Button>
            <Button variant="danger" onClick={() => remove(p.id)}>
              Supprimer
            </Button>
          </div>
        </Dialog>
      </td>
    </tr>
  );
}

function Onboarding({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-[1040px] px-6 pb-16 pt-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-go">GoLive Community</p>
      <h2 className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">
        Rien ne part en production
        <br />
        sans son feu vert.
      </h2>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-2">
        Dessinez votre architecture. GoLive la confronte aux référentiels de sécurité, d'exploitation et de conformité de vos pays, puis rend un verdict Go / No-Go
        reproductible, avec la liste exacte de ce qui bloque.
      </p>
      <ol className="mt-8 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          ["01", "Décrire", "Composants, flux, données, pays"],
          ["02", "Vérifier", "Règles déterministes et sourcées"],
          ["03", "Corriger", "Une tâche par écart, priorisée"],
          ["04", "Décider", "Go, Go conditionnel ou No-Go"],
        ].map(([n, t, d]) => (
          <li key={n} className="bg-surface px-4 py-3">
            <span className="font-mono text-[11px] text-fg-3">{n}</span>
            <p className="mt-1 text-[13px] font-medium">{t}</p>
            <p className="text-xs text-fg-3">{d}</p>
          </li>
        ))}
      </ol>
      <h3 className="mb-3 mt-12 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">Commencer à partir d'un modèle</h3>
      <TemplateGrid onPick={onPick} />
    </div>
  );
}
