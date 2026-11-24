"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  AUDIENCES,
  COUNTRIES,
  CRITICALITY,
  DATA_LABELS,
  FEATURE_LABELS,
  FEATURES,
  PERSONAL_DATA,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  SENSITIVE_DATA,
  type Spec,
} from "@golive/spec";
import { COMMUNITY_PACKS, suggestProfiles } from "@golive/engine";
import { useStore } from "@/lib/store";
import { Button, cx, Field, Input, Select, Textarea } from "./ui";
import type { WorkspaceProps } from "./workspace";

const AUDIENCE_LABELS = { public: "Grand public", authenticated: "Utilisateurs connectés", internal: "Interne à l'organisation" };
const CRITICALITY_LABELS = { standard: "Standard", financial: "Financier", health: "Santé", "public-service": "Service public" };

export function Sheet({ project }: WorkspaceProps) {
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
        <Section title="Identité" description="Ce que vous mettez en ligne. Le type et la criticité ajustent les règles et le seuil de Go.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom du projet" className="col-span-2">
              <Input value={spec.project.name} onChange={(e) => setProject({ name: e.target.value })} />
            </Field>
            <Field label="Type de projet">
              <Select value={spec.project.type} onChange={(e) => setProject({ type: e.target.value as Spec["project"]["type"] })}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROJECT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Criticité" hint="Hors standard, le seuil de Go passe de 70 à 80.">
              <Select value={spec.project.criticality} onChange={(e) => setProject({ criticality: e.target.value as Spec["project"]["criticality"] })}>
                {CRITICALITY.map((c) => (
                  <option key={c} value={c}>
                    {CRITICALITY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Public visé">
              <Select value={spec.project.audience} onChange={(e) => setProject({ audience: e.target.value as Spec["project"]["audience"] })}>
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Langues" hint="Codes séparés par des virgules : fr, en, wo">
              <Input
                mono
                defaultValue={spec.project.languages.join(", ")}
                onBlur={(e) => setProject({ languages: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              />
            </Field>
            <Field label="Description" className="col-span-2">
              <Textarea value={spec.project.description ?? ""} onChange={(e) => setProject({ description: e.target.value || undefined })} placeholder="En une ou deux phrases." />
            </Field>
          </div>
        </Section>

        <Section title="Pays de diffusion" description="Chaque pays active ses packs légaux : Sénégal (CDP), Union européenne (RGPD)…">
          <Chips
            options={Object.entries(COUNTRIES).map(([code, name]) => ({ value: code, label: name, mono: code }))}
            selected={spec.project.countries}
            onToggle={(v) => setProject({ countries: toggle(spec.project.countries, v) })}
          />
        </Section>

        <Section title="Données personnelles" description="Ce que le service collecte ou stocke. Les données sensibles déclenchent des régimes d'autorisation.">
          <p className="mb-2 text-xs font-medium text-fg-2">Données courantes</p>
          <Chips
            options={PERSONAL_DATA.map((d) => ({ value: d, label: DATA_LABELS[d] }))}
            selected={spec.data.personal}
            onToggle={(v) => set((s) => ({ ...s, data: { ...s.data, personal: toggle(s.data.personal, v) } }))}
          />
          <p className="mb-2 mt-5 text-xs font-medium text-fg-2">Données sensibles</p>
          <Chips
            tone="red"
            options={SENSITIVE_DATA.map((d) => ({ value: d, label: DATA_LABELS[d] }))}
            selected={spec.data.sensitive}
            onToggle={(v) => set((s) => ({ ...s, data: { ...s.data, sensitive: toggle(s.data.sensitive, v) } }))}
          />
        </Section>

        <Section title="Fonctionnalités" description="Chaque fonctionnalité entraîne des exigences : paiement ⇒ CGV et webhooks signés, comptes ⇒ MFA et suppression de compte…">
          <Chips
            options={FEATURES.map((f) => ({ value: f, label: FEATURE_LABELS[f] }))}
            selected={spec.features}
            onToggle={(v) => set((s) => ({ ...s, features: toggle(s.features, v) }))}
          />
        </Section>

        <Section title="Cibles" description="Les URL auditées en couche 3. Le dépôt sera analysé en couche 2.">
          <div className="grid gap-3">
            {(["preprod", "prod"] as const).map((k) => (
              <Field key={k} label={k === "prod" ? "Production" : "Pré-production"}>
                <Input
                  mono
                  type="url"
                  placeholder={`https://${k === "prod" ? "" : "preprod."}exemple.sn`}
                  defaultValue={spec.targets[k] ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && !/^https?:\/\/[^\s]+$/.test(v)) return;
                    set((s) => ({ ...s, targets: { ...s.targets, [k]: v || undefined } }));
                  }}
                />
              </Field>
            ))}
            <Field label="Dépôt de code">
              <Input mono placeholder="https://github.com/organisation/projet" defaultValue={spec.targets.repository ?? ""} onBlur={(e) => set((s) => ({ ...s, targets: { ...s.targets, repository: e.target.value.trim() || undefined } }))} />
            </Field>
          </div>
        </Section>

        <Section title="Zones d'hébergement" description="Regroupez les composants par hébergeur et pays. Une zone en réseau public expose ses composants.">
          <div className="flex flex-col gap-2">
            {spec.zones.map((z, i) => {
              const patch = (p: Partial<typeof z>) => set((s) => ({ ...s, zones: s.zones.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
              return (
                <div key={z.id} className="grid grid-cols-[1fr_1fr_120px_110px_32px] gap-2">
                  <Input value={z.name ?? ""} placeholder={z.id} onChange={(e) => patch({ name: e.target.value || undefined })} aria-label="Nom de la zone" />
                  <Input value={z.provider ?? ""} placeholder="Fournisseur" onChange={(e) => patch({ provider: e.target.value || undefined })} aria-label="Fournisseur" />
                  <Select value={z.country ?? ""} onChange={(e) => patch({ country: e.target.value || undefined })} aria-label="Pays">
                    <option value="">Pays</option>
                    {Object.keys(COUNTRIES).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                  <Select value={z.network} onChange={(e) => patch({ network: e.target.value as "public" | "private" })} aria-label="Réseau">
                    <option value="private">Privé</option>
                    <option value="public">Public</option>
                  </Select>
                  <Button
                    variant="ghost"
                    icon={<Trash2 size={14} />}
                    aria-label="Retirer la zone"
                    onClick={() =>
                      set((s) => ({ ...s, zones: s.zones.filter((_, j) => j !== i), components: s.components.map((c) => (c.zone === z.id ? { ...c, zone: undefined } : c)) }))
                    }
                  />
                </div>
              );
            })}
            <div>
              <Button size="sm" icon={<Plus size={13} />} onClick={() => set((s) => ({ ...s, zones: [...s.zones, { id: nextZoneId(s), network: "private" }] }))}>
                Ajouter une zone
              </Button>
            </div>
          </div>
        </Section>

        <Section
          title="Packs de conformité"
          description="Les référentiels appliqués. En automatique, GoLive les choisit d'après le type, les fonctionnalités et les pays."
          last
        >
          <label className="mb-3 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => set((s) => ({ ...s, profiles: e.target.checked ? [] : suggested }))}
              className="size-4 accent-[var(--go)]"
            />
            Sélection automatique (recommandé)
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
                      {p.name} <span className="font-mono text-[10.5px] font-normal text-fg-3">{p.id}@{p.version}</span>
                    </p>
                    <p className="text-xs text-fg-3">{p.description}</p>
                  </div>
                  <span className="tnum shrink-0 font-mono text-[11px] text-fg-3">{p.rules.length} règles</span>
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
