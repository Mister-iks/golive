"use client";

import type { ReactNode } from "react";
import { FileJson, Printer } from "lucide-react";
import { categoryLabels, COMMUNITY_PACKS } from "@golive/engine";
import { useCatalog, useLang, useMessages } from "@/i18n/client";
import { reportMessages } from "@/i18n/messages/report";
import { download, longDate, slug } from "@/lib/format";
import { Wordmark } from "./brand";
import { Button, cx, SeverityTag, StatusIcon, useLabels } from "./ui";
import type { WorkspaceProps } from "./workspace";

const SEV = { blocker: 0, major: 1, minor: 2, info: 3 };

export function ReportView({ project, report }: WorkspaceProps) {
  const t = useMessages(reportMessages);
  const { lang } = useLang();
  const { COUNTRIES, DATA_LABELS, FEATURE_LABELS, PROJECT_TYPE_LABELS } = useCatalog();
  const L = useLabels();
  const CATEGORY_LABELS = categoryLabels(lang);
  const packName = (id: string) => {
    const p = COMMUNITY_PACKS.find((x) => x.id === id);
    return p ? (lang === "fr" && p.fr?.name) || p.name : id;
  };
  const date = (iso: string) => longDate(iso, lang);
  const spec = project.spec;
  const open = report.results
    .filter((r) => r.status === "fail" || r.status === "evidence" || r.status === "warn")
    .sort((a, b) => Number(b.blocking) - Number(a.blocking) || SEV[a.severity] - SEV[b.severity]);
  const attested = report.results.filter((r) => r.attested);
  const waived = report.results.filter((r) => r.waiver);
  const d = report.verdict.decision;

  return (
    <div className="print-root h-full overflow-y-auto bg-sunken/50 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex justify-end gap-2 border-b border-line bg-surface/90 px-5 py-2 backdrop-blur">
        <Button size="sm" icon={<FileJson size={13} />} onClick={() => download(`golive-report-${slug(spec.project.name)}.json`, JSON.stringify(report, null, 2), "application/json")}>
          JSON
        </Button>
        <Button size="sm" variant="primary" icon={<Printer size={13} />} onClick={() => window.print()}>
          {t.print}
        </Button>
      </div>

      <article className="mx-auto my-8 max-w-[820px] rounded-lg border border-line bg-surface px-12 py-11 print:my-0 print:max-w-none print:border-0 print:p-0">
        <header className="flex items-start justify-between border-b border-line pb-6">
          <div>
            <Wordmark size="lg" />
            <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3">{t.kicker}</p>
            <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">{spec.project.name}</h1>
            <p className="mt-1 text-[13px] text-fg-3">
              {PROJECT_TYPE_LABELS[spec.project.type]} · {t.asOf(date(report.asOf))}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cx(
                "text-[40px] font-semibold leading-none tracking-[-0.03em]",
                d === "go" ? "text-go-ink" : d === "conditional" ? "text-amber-ink" : "text-red-ink",
              )}
            >
              {L.decision[d].toUpperCase()}
            </p>
            <p className="tnum mt-2 text-[13px] text-fg-2">
              Score <strong className="font-semibold text-fg">{report.score.global}</strong>/100 · {t.threshold(report.threshold)}
            </p>
          </div>
        </header>

        <section className="break-avoid border-b border-line py-5">
          <ul className="flex flex-col gap-1 text-[13px]">
            {report.verdict.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-fg-4">›</span>
                {r}
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-6">
            {Object.entries(report.score.byCategory).map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-2.5">
                <p className="truncate text-[10.5px] text-fg-3">{CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS]}</p>
                <p className={cx("tnum text-[18px] font-semibold", v! >= 80 ? "text-go-ink" : v! >= 50 ? "text-amber-ink" : "text-red-ink")}>{v}</p>
              </div>
            ))}
          </div>
        </section>

        <Block title={t.scope}>
          <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <Dt>{t.countries}</Dt>
            <dd>{spec.project.countries.map((c) => COUNTRIES[c] ?? c).join(", ") || t.notSpecified}</dd>
            <Dt>{t.personalData}</Dt>
            <dd>{[...spec.data.personal, ...spec.data.sensitive].map((x) => DATA_LABELS[x]).join(", ") || t.noneDeclared}</dd>
            <Dt>{t.features}</Dt>
            <dd>{spec.features.map((f) => FEATURE_LABELS[f]).join(", ") || t.noneDeclared}</dd>
            <Dt>{t.architecture}</Dt>
            <dd>{t.architectureCount(spec.components.length, spec.links.length, spec.actors.length)}</dd>
            <Dt>{t.layersChecked}</Dt>
            <dd>
              {report.coverage.layers.map((l) => t.layerNames[l]).join(", ")}
              {report.coverage.web && (
                <span className="text-fg-3">
                  {" "}
                  (<span className="font-mono text-xs">{report.coverage.web.url}</span>, {report.coverage.web.env === "prod" ? t.envProd : t.envPreprod})
                </span>
              )}
            </dd>
          </dl>
        </Block>

        <Block title={t.packs}>
          <table className="w-full text-[12.5px]">
            <tbody>
              {report.packs.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="py-1.5">{p.name}</td>
                  <td className="py-1.5 font-mono text-[11px] text-fg-3">
                    {p.id}@{p.version}
                  </td>
                  <td className="py-1.5 text-right text-xs text-fg-3">{p.stale ? t.legalReviewDue : p.reviewedAt ? t.reviewedOn(date(p.reviewedAt)) : t.maintained}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title={t.openItems(open.length)}>
          {open.length === 0 ? (
            <p className="text-[13px] text-fg-3">{t.noOpenItems}</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-fg-3">
                  <th className="w-6 py-1.5 font-medium" />
                  <th className="py-1.5 font-medium">{t.check}</th>
                  <th className="w-[84px] py-1.5 font-medium">{t.severity}</th>
                </tr>
              </thead>
              <tbody>
                {open.map((r) => (
                  <tr key={r.ruleId} className="break-avoid border-b border-line align-top last:border-0">
                    <td className="py-2">
                      <StatusIcon status={r.status} size={13} />
                    </td>
                    <td className="py-2 pr-4">
                      <p className="font-medium">
                        {r.title}
                        {r.waiver && <span className="ml-1.5 text-xs font-normal text-amber-ink">{t.waiverTag}</span>}
                      </p>
                      <p className="text-fg-2">{r.findings.filter((f) => f.status !== "pass").map((f) => f.message).join(" ")}</p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-fg-3">
                        {r.ruleId} · {packName(r.packId)} · {r.source.label}
                      </p>
                    </td>
                    <td className="py-2">
                      <SeverityTag severity={r.severity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>

        {attested.length > 0 && (
          <Block title={t.proofs(attested.length)}>
            <ul className="flex flex-col gap-1.5 text-[12.5px]">
              {attested.map((r) => (
                <li key={r.ruleId} className="break-avoid">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-fg-2">
                    {t.attestedBy(r.attested!.by, date(r.attested!.date))}
                    {r.attested!.note ? `. ${r.attested!.note}` : ""}
                  </span>
                  {r.attested!.url && <span className="block font-mono text-[10.5px] text-fg-3">{r.attested!.url}</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {waived.length > 0 && (
          <Block title={t.waivers(waived.length)}>
            <ul className="flex flex-col gap-2 text-[12.5px]">
              {waived.map((r) => (
                <li key={r.ruleId} className="break-avoid rounded-md border border-amber-line bg-amber-soft/60 px-3 py-2">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-fg-2">
                    {r.waiver!.reason} {t.signedBy(r.waiver!.owner, date(r.waiver!.expires))}
                  </p>
                  {r.waiver!.plan && <p className="text-fg-3">
                      {t.plan} {r.waiver!.plan}
                    </p>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block title={t.appendix}>
          <table className="w-full text-[11.5px]">
            <tbody>
              {report.results
                .filter((r) => r.status !== "na")
                .map((r) => (
                  <tr key={r.ruleId} className="border-b border-line last:border-0">
                    <td className="w-5 py-1">
                      <StatusIcon status={r.status} size={11} />
                    </td>
                    <td className="py-1">{r.title}</td>
                    <td className="py-1 font-mono text-[10px] text-fg-3">{r.ruleId}</td>
                    <td className="py-1 text-right text-fg-3">{L.status[r.status]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Block>

        <footer className="mt-8 border-t border-line pt-4 text-[11px] leading-relaxed text-fg-3">
          <p>
            {t.fingerprint} <span className="font-mono text-fg-2">{report.fingerprint}</span>
            {t.engineLine(report.engine, report.asOf)}
          </p>
          <p className="mt-2">{t.disclaimer}</p>
        </footer>
      </article>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line py-5 last:border-0">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-3">{title}</h2>
      {children}
    </section>
  );
}

const Dt = ({ children }: { children: ReactNode }) => <dt className="text-fg-3">{children}</dt>;
