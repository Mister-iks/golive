"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Globe, Mail, RotateCw, Trash2, UserPlus } from "lucide-react";
import { useOrgRoleLabels } from "@/components/account";
import { PageHeader, Shell } from "@/components/shell";
import { Button, cx, Dialog, Empty, Field, Input, Select, Tip } from "@/components/ui";
import { LOCALE } from "@/i18n";
import { useLang, useMessages } from "@/i18n/client";
import { settingsMessages } from "@/i18n/messages/settings";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { useStore, type OrgRole } from "@/lib/store";
import { useMe } from "@/lib/use-report";

const TABS = ["members", "domains", "activity", "org"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  return (
    <Shell>
      <Suspense>
        <Settings />
      </Suspense>
    </Shell>
  );
}

function Settings() {
  const { org } = useMe();
  const t = useMessages(settingsMessages);
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((id) => id === params.get("tab")) ?? "members") as Tab;
  const admin = org?.role === "owner" || org?.role === "admin";
  if (!org) return null;

  return (
    <>
      <PageHeader title={org.name} />
      <nav className="flex h-10 shrink-0 items-end gap-1 border-b border-line bg-surface px-3" role="tablist">
        {TABS.filter((id) => admin || id === "members" || id === "domains").map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => router.replace(`/settings?tab=${id}`, { scroll: false })}
            className={cx("relative flex h-9 items-center px-2.5 text-[13px] transition-colors", tab === id ? "text-fg" : "text-fg-3 hover:text-fg")}
          >
            {t.tabs[id]}
            {tab === id && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[920px] px-6 py-6">
          {tab === "members" && <Members orgId={org.id} admin={admin} />}
          {tab === "domains" && <Domains orgId={org.id} initialHost={params.get("host") ?? ""} />}
          {tab === "activity" && admin && <Activity orgId={org.id} />}
          {tab === "org" && admin && <OrgSettings orgId={org.id} name={org.name} />}
        </div>
      </div>
    </>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

const notify = (e: unknown) => useStore.getState().notify((e as Error).message);

/* ---------------------------------------------------------------- members */

interface MembersData {
  role: OrgRole;
  members: { userId: string; name: string; email: string; role: OrgRole; twoFactor: boolean | null; since: string }[];
  invitations: { id: string; email: string; orgRole: OrgRole; expiresAt: string; expired: boolean; createdAt: string }[];
}

function Members({ orgId, admin }: { orgId: string; admin: boolean }) {
  const { me } = useMe();
  const t = useMessages(settingsMessages);
  const roles = useOrgRoleLabels();
  const { lang } = useLang();
  const [data, setData] = useState<MembersData>();
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<{ url: string; email: string; sent: boolean }>();
  const load = () => api<MembersData>(`/orgs/${orgId}/members`).then(setData).catch(notify);
  useEffect(() => {
    void load();
  }, [orgId]);

  const act = (p: Promise<unknown>) => p.then(load).catch(notify);

  return (
    <>
      <Card
        title={t.members(data?.members.length)}
        aside={
          admin && (
            <Button variant="primary" size="sm" icon={<UserPlus size={13} />} onClick={() => setInviting(true)}>
              {t.invite}
            </Button>
          )
        }
      >
        <ul className="divide-y divide-line">
          {data?.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium">
                  {m.name} {m.userId === me?.user.id && <span className="font-normal text-fg-3">{t.you}</span>}
                </p>
                <p className="truncate text-xs text-fg-3">{m.email}</p>
              </div>
              {(m.role === "owner" || m.role === "admin") && !m.twoFactor && (
                <Tip label={t.no2faTip}>
                  <span className="rounded-full border border-amber-line bg-amber-soft px-2 py-0.5 text-[10.5px] text-amber">{t.no2fa}</span>
                </Tip>
              )}
              <div className="w-[160px]">
                <Select
                  value={m.role}
                  disabled={!admin || m.userId === me?.user.id}
                  onChange={(e) => act(api(`/orgs/${orgId}/members/${m.userId}`, { method: "PATCH", body: { role: e.target.value } }))}
                  aria-label={t.roleOf(m.name)}
                >
                  {(["owner", "admin", "member"] as const).map((r) => (
                    <option key={r} value={r}>
                      {roles[r]}
                    </option>
                  ))}
                </Select>
              </div>
              {(admin || m.userId === me?.user.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  aria-label={m.userId === me?.user.id ? t.leave : t.remove(m.name)}
                  onClick={() => {
                    if (confirm(m.userId === me?.user.id ? t.confirmLeave : t.confirmRemove(m.name)))
                      void act(api(`/orgs/${orgId}/members/${m.userId}`, { method: "DELETE" })).then(() => m.userId === me?.user.id && location.assign("/"));
                  }}
                />
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-fg-3">
          {t.membersHint}
        </p>
      </Card>

      {admin && !!data?.invitations.length && (
        <Card title={t.pending}>
          <ul className="divide-y divide-line">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <Mail size={14} className="shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate font-mono text-[12.5px]">{i.email}</p>
                  <p className="text-xs text-fg-3">
                    {roles[i.orgRole]} · {i.expired ? <span className="text-red">{t.expired}</span> : t.expires(ago(i.expiresAt, lang))}
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={<RotateCw size={13} />}
                  onClick={() =>
                    api<{ link: string; emailSent: boolean }>(`/orgs/${orgId}/invitations/${i.id}`, { method: "POST" })
                      .then((r) => {
                        setLink({ url: r.link, email: i.email, sent: r.emailSent });
                        return load();
                      })
                      .catch(notify)
                  }
                >
                  {t.resend}
                </Button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} aria-label={t.cancelInvitation} onClick={() => act(api(`/orgs/${orgId}/invitations/${i.id}`, { method: "DELETE" }))} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InviteDialog
        orgId={orgId}
        open={inviting}
        onOpenChange={setInviting}
        onDone={(r) => {
          setLink(r);
          void load();
        }}
      />
      <Dialog open={!!link} onOpenChange={() => setLink(undefined)} title={t.created} description={link?.sent ? t.emailSent(link.email) : t.noMail(link?.email ?? "")}>
        <div className="flex flex-col gap-3 p-5">
          <CopyField value={link?.url ?? ""} />
          <p className="text-xs text-fg-3">{t.linkHint}</p>
        </div>
      </Dialog>
    </>
  );
}

function InviteDialog({ orgId, open, onOpenChange, onDone }: { orgId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: (r: { url: string; email: string; sent: boolean }) => void }) {
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const t = useMessages(settingsMessages);
  const roles = useOrgRoleLabels();

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ link: string; emailSent: boolean }>(`/orgs/${orgId}/invitations`, { body: { email, orgRole } });
      onOpenChange(false);
      onDone({ url: r.link, email, sent: r.emailSent });
      setEmail("");
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t.inviteTitle} description={t.inviteDesc} width={520}>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <Field label={t.email}>
            <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} />
          </Field>
          <Field label={t.role}>
            <Select value={orgRole} onChange={(e) => setOrgRole(e.target.value as typeof orgRole)}>
              <option value="member">{roles.member}</option>
              <option value="admin">{roles.admin}</option>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-fg-3">{t.premiumHint}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !email}>
            {t.send}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const t = useMessages(settingsMessages);
  return (
    <div className="flex gap-2">
      <Input mono readOnly value={value} onFocus={(e) => e.target.select()} />
      <Button
        icon={copied ? <Check size={14} /> : <Copy size={14} />}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t.copied : t.copy}
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- domains */

interface Domain {
  id: string;
  hostname: string;
  token: string;
  method: "dns" | "file" | null;
  verifiedAt: string | null;
  checkedAt: string | null;
}

function Domains({ orgId, initialHost }: { orgId: string; initialHost: string }) {
  const { me } = useMe();
  const t = useMessages(settingsMessages).domains;
  const [data, setData] = useState<{ dnsPrefix: string; file: string; domains: Domain[] }>();
  const [host, setHost] = useState(initialHost);
  const [busy, setBusy] = useState<string>();
  const [result, setResult] = useState<Record<string, string>>({});
  const load = () => api<typeof data>(`/orgs/${orgId}/domains`).then(setData).catch(notify);
  useEffect(() => {
    void load();
  }, [orgId]);

  const add = async () => {
    setBusy("add");
    try {
      await api(`/orgs/${orgId}/domains`, { body: { hostname: host } });
      setHost("");
      await load();
    } catch (e) {
      notify(e);
    } finally {
      setBusy(undefined);
    }
  };
  const verify = async (d: Domain) => {
    setBusy(d.id);
    try {
      const r = await api<{ ok: boolean; detail: string }>(`/orgs/${orgId}/domains/${d.id}`, { method: "POST" });
      setResult((cur) => ({ ...cur, [d.id]: r.detail }));
      await load();
    } catch (e) {
      notify(e);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      {me && !me.settings.domainVerification && (
        <p className="mb-4 rounded-md border border-amber-line bg-amber-soft px-3 py-2 text-[13px] text-amber">
          {t.disabled}
        </p>
      )}
      <Card title={t.title}>
        <p className="px-4 pt-3 text-[13px] leading-relaxed text-fg-2">
          {t.intro.a}
          <span className="font-mono">{t.example}</span>
          {t.intro.b}
          <span className="font-mono">www.{t.example}</span>
          {t.intro.c}
          <span className="font-mono">preprod.{t.example}</span>
          {t.intro.d}
        </p>
        <form
          className="flex gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input mono required value={host} onChange={(e) => setHost(e.target.value)} placeholder={t.example} aria-label={t.domain} />
          <Button type="submit" variant="primary" icon={<Globe size={14} />} disabled={busy === "add" || !host}>
            {t.add}
          </Button>
        </form>
        {!data?.domains.length ? (
          <div className="border-t border-line">
            <Empty title={t.emptyTitle}>{t.emptyBody}</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {data.domains.map((d) => (
              <li key={d.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] font-medium">{d.hostname}</span>
                  {d.verifiedAt ? (
                    <span className="rounded-full border border-go-line bg-go-soft px-2 py-0.5 text-[11px] text-go">{t.verifiedBy(d.method === "dns")}</span>
                  ) : (
                    <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-fg-3">{t.pending}</span>
                  )}
                  <span className="flex-1" />
                  {!d.verifiedAt && (
                    <Button size="sm" variant="primary" disabled={busy === d.id} onClick={() => void verify(d)}>
                      {busy === d.id ? t.verifying : t.verify}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    aria-label={t.removeDomain(d.hostname)}
                    onClick={() => api(`/orgs/${orgId}/domains/${d.id}`, { method: "DELETE" }).then(load).catch(notify)}
                  />
                </div>
                {!d.verifiedAt && data && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Proof
                      title={t.dnsOption}
                      lines={[
                        [t.type, "TXT"],
                        [t.name, `${data.dnsPrefix}.${d.hostname}`],
                        [t.value, d.token],
                      ]}
                    />
                    <Proof
                      title={t.fileOption}
                      lines={[
                        [t.url, `https://${d.hostname}${data.file}`],
                        [t.content, d.token],
                      ]}
                    />
                  </div>
                )}
                {result[d.id] && !d.verifiedAt && <p className="mt-2 text-xs text-red">{result[d.id]}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Proof({ title, lines }: { title: string; lines: [string, string][] }) {
  const t = useMessages(settingsMessages);
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <p className="mb-2 text-xs font-medium">{title}</p>
      <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-xs">
        {lines.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-fg">{v}</span>
              <button onClick={() => navigator.clipboard.writeText(v)} className="shrink-0 text-fg-4 hover:text-fg" aria-label={t.copyItem(k)}>
                <Copy size={11} />
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------------------------------------------------------------- activity */


function Activity({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<{ id: number; at: string; action: string; target: string | null; actor: string | null; project: string | null; meta: Record<string, unknown> }[]>();
  const t = useMessages(settingsMessages).activity;
  const { lang } = useLang();
  useEffect(() => {
    api<typeof rows>(`/orgs/${orgId}/activity`).then(setRows).catch(notify);
  }, [orgId]);
  return (
    <Card title={t.title} aside={<span className="text-xs text-fg-3">{t.hint}</span>}>
      <table className="w-full text-left text-[13px]">
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-fg-3" title={new Date(r.at).toLocaleString(LOCALE[lang])}>
                {ago(r.at, lang)}
              </td>
              <td className="px-2 py-2">{r.actor ?? <span className="text-fg-4">{t.system}</span>}</td>
              <td className="px-2 py-2">{t.actions[r.action] ?? r.action}</td>
              <td className="max-w-[320px] truncate px-4 py-2 text-xs text-fg-3">
                {[r.project, r.action === "audit.done" ? `${String(r.meta.verdict)} · ${String(r.meta.score)}` : r.target].filter(Boolean).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ---------------------------------------------------------------- organization */

function OrgSettings({ orgId, name: initial }: { orgId: string; name: string }) {
  const [name, setName] = useState(initial);
  const t = useMessages(settingsMessages).org;
  return (
    <Card title={t.title}>
      <form
        className="flex items-end gap-2 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/orgs/${orgId}`, { method: "PATCH", body: { name } });
            await useStore.getState().loadMe();
            useStore.getState().notify(t.saved, "info");
          } catch (err) {
            notify(err);
          }
        }}
      >
        <Field label={t.name} className="flex-1">
          <Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={!name.trim() || name === initial}>
          {t.save}
        </Button>
      </form>
    </Card>
  );
}
