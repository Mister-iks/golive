"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AUDIENCES, CRITICALITY, FEATURES, PERSONAL_DATA, PROJECT_TYPES, SENSITIVE_DATA, type Spec } from "@golive/spec";
import { COMMUNITY_PACKS, suggestProfiles } from "@golive/engine";
import { useCatalog, useLang, useMessages } from "@/i18n/client";
import { sheetMessages } from "@/i18n/messages/sheet";
import { useStore } from "@/lib/store";
import { Button, cx, Field, Input, Select, Textarea } from "./ui";
import type { WorkspaceProps } from "./workspace";

export function Sheet({ project }: WorkspaceProps) {
  const t = useMessages(sheetMessages);
  const { lang } = useLang();
  const { COUNTRIES, DATA_LABELS, FEATURE_LABELS, PROJECT_TYPE_LABELS } = useCatalog();
  const update = useStore((s) => s.update);
  const spec = project.spec;
  const set = (fn: (s: Spec) => Spec) => update(project.id, fn);
  const setProject = (p: Partial<Spec["project"]>) => set((s) => ({ ...s, project: { ...s.project, ...p } }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const suggested = suggestProfiles({ ...spec, profiles: [] });
  const auto = spec.profiles.length === 0;
  const active = auto ? suggested : spec.profiles;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[920px] px-6 py-8">
        <Section title={t.identity} description={t.identityDesc}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.projectName} className="col-span-2">
              <Input value={spec.project.name} onChange={(e) => setProject({ name: e.target.value })} />
            </Field>
            <Field label={t.projectType}>
              <Select value={spec.project.type} onChange={(e) => setProject({ type: e.target.value as Spec["project"]["type"] })}>
                {PROJECT_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {PROJECT_TYPE_LABELS[pt]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.criticalityLabel} hint={t.criticalityHint}>
              <Select value={spec.project.criticality} onChange={(e) => setProject({ criticality: e.target.value as Spec["project"]["criticality"] })}>
                {CRITICALITY.map((c) => (
                  <option key={c} value={c}>
                    {t.criticality[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.audienceLabel}>
              <Select value={spec.project.audience} onChange={(e) => setProject({ audience: e.target.value as Spec["project"]["audience"] })}>
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {t.audience[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.languages} hint={t.languagesHint}>
              <Input
                mono
                defaultValue={spec.project.languages.join(", ")}
                onBlur={(e) => setProject({ languages: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              />
            </Field>
            <Field label={t.description} className="col-span-2">
              <Textarea value={spec.project.description ?? ""} onChange={(e) => setProject({ description: e.target.value || undefined })} placeholder={t.descriptionPlaceholder} />
            </Field>
          </div>
        </Section>

        <Section title={t.countries} description={t.countriesDesc}>
          <Chips
            options={Object.entries(COUNTRIES).map(([code, name]) => ({ value: code, label: name, mono: code }))}
            selected={spec.project.countries}
            onToggle={(v) => setProject({ countries: toggle(spec.project.countries, v) })}
          />
        </Section>

        <Section title={t.personalData} description={t.personalDataDesc}>
          <p className="mb-2 text-xs font-medium text-fg-2">{t.commonData}</p>
          <Chips
            options={PERSONAL_DATA.map((d) => ({ value: d, label: DATA_LABELS[d] }))}
            selected={spec.data.personal}
            onToggle={(v) => set((s) => ({ ...s, data: { ...s.data, personal: toggle(s.data.personal, v) } }))}
          />
          <p className="mb-2 mt-5 text-xs font-medium text-fg-2">{t.sensitiveData}</p>
          <Chips
            tone="red"
            options={SENSITIVE_DATA.map((d) => ({ value: d, label: DATA_LABELS[d] }))}
            selected={spec.data.sensitive}
            onToggle={(v) => set((s) => ({ ...s, data: { ...s.data, sensitive: toggle(s.data.sensitive, v) } }))}
          />
        </Section>

        <Section title={t.features} description={t.featuresDesc}>
          <Chips
            options={FEATURES.map((f) => ({ value: f, label: FEATURE_LABELS[f] }))}
            selected={spec.features}
            onToggle={(v) => set((s) => ({ ...s, features: toggle(s.features, v) }))}
          />
        </Section>

        <Section title={t.targets} description={t.targetsDesc}>
          <div className="grid gap-3">
            {(["preprod", "prod"] as const).map((k) => (
              <Field key={k} label={k === "prod" ? t.prod : t.preprod}>
                <Input
                  mono
                  type="url"
                  placeholder={`https://${k === "prod" ? "" : "preprod."}example.com`}
                  defaultValue={spec.targets[k] ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && !/^https?:\/\/[^\s]+$/.test(v)) return;
                    set((s) => ({ ...s, targets: { ...s.targets, [k]: v || undefined } }));
                  }}
                />
              </Field>
            ))}
            <Field label={t.repository}>
              <Input mono placeholder={t.repositoryPlaceholder} defaultValue={spec.targets.repository ?? ""} onBlur={(e) => set((s) => ({ ...s, targets: { ...s.targets, repository: e.target.value.trim() || undefined } }))} />
            </Field>
          </div>
        </Section>

        <Section title={t.zones} description={t.zonesDesc}>
          <div className="flex flex-col gap-2">
            {spec.zones.map((z, i) => {
              const patch = (p: Partial<typeof z>) => set((s) => ({ ...s, zones: s.zones.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
              return (
                <div key={z.id} className="grid grid-cols-[1fr_1fr_120px_110px_32px] gap-2">
                  <Input value={z.name ?? ""} placeholder={z.id} onChange={(e) => patch({ name: e.target.value || undefined })} aria-label={t.zoneName} />
                  <Input value={z.provider ?? ""} placeholder={t.provider} onChange={(e) => patch({ provider: e.target.value || undefined })} aria-label={t.provider} />
                  <Select value={z.country ?? ""} onChange={(e) => patch({ country: e.target.value || undefined })} aria-label={t.country}>
                    <option value="">{t.country}</option>
                    {Object.keys(COUNTRIES).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                  <Select value={z.network} onChange={(e) => patch({ network: e.target.value as "public" | "private" })} aria-label={t.network}>
                    <option value="private">{t.private}</option>
                    <option value="public">{t.public}</option>
                  </Select>
                  <Button
                    variant="ghost"
                    icon={<Trash2 size={14} />}
                    aria-label={t.removeZone}
                    onClick={() =>
                      set((s) => ({ ...s, zones: s.zones.filter((_, j) => j !== i), components: s.components.map((c) => (c.zone === z.id ? { ...c, zone: undefined } : c)) }))
                    }
                  />
                </div>
              );
            })}
            <div>
              <Button size="sm" icon={<Plus size={13} />} onClick={() => set((s) => ({ ...s, zones: [...s.zones, { id: nextZoneId(s), network: "private" }] }))}>
                {t.addZone}
              </Button>
            </div>
          </div>
        </Section>

        <Section
          title={t.packs}
          description={t.packsDesc}
          last
        >
          <label className="mb-3 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => set((s) => ({ ...s, profiles: e.target.checked ? [] : suggested }))}
              className="size-4 accent-[var(--go)]"
            />
            {t.autoSelect}
          </label>
          <div className="overflow-hidden rounded-lg border border-line">
            {COMMUNITY_PACKS.map((p) => {
              const on = active.includes(p.id);
              return (
                <label key={p.id} className={cx("flex items-start gap-3 border-b border-line px-3.5 py-3 last:border-0", auto ? "opacity-80" : "cursor-pointer hover:bg-surface-2")}>
                  <input
                    type="checkbox"
                    disabled={auto}
                    checked={on}
                    onChange={() => set((s) => ({ ...s, profiles: toggle(s.profiles, p.id) }))}
                    className="mt-0.5 size-4 accent-[var(--go)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      {(lang === "fr" && p.fr?.name) || p.name} <span className="font-mono text-[10.5px] font-normal text-fg-3">{p.id}@{p.version}</span>
                    </p>
                    <p className="text-xs text-fg-3">{(lang === "fr" && p.fr?.description) || p.description}</p>
                  </div>
                  <span className="tnum shrink-0 font-mono text-[11px] text-fg-3">{t.rules(p.rules.length)}</span>
                </label>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, description, children, last }: { title: string; description: string; children: ReactNode; last?: boolean }) {
  return (
    <section className={cx("grid grid-cols-1 gap-x-10 gap-y-4 py-7 md:grid-cols-[240px_1fr]", !last && "border-b border-line")}>
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Chips<T extends string>({
  options,
  selected,
  onToggle,
  tone,
}: {
  options: { value: T; label: string; mono?: string }[];
  selected: T[];
  onToggle: (v: T) => void;
  tone?: "red";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors",
              on
                ? tone === "red"
                  ? "border-red-line bg-red-soft text-red"
                  : "border-fg bg-fg text-bg"
                : "border-line-strong bg-surface text-fg-2 hover:border-fg-4 hover:text-fg",
            )}
          >
            {o.mono && <span className={cx("font-mono text-[10.5px]", on ? "opacity-70" : "text-fg-3")}>{o.mono}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function nextZoneId(spec: Spec) {
  const taken = new Set(spec.zones.map((z) => z.id));
  for (let i = 1; ; i++) if (!taken.has(`zone-${i}`)) return `zone-${i}`;
}
