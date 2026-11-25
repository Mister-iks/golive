"use client";

import { useState, type ReactNode } from "react";
import { renderSVG } from "uqr";
import { Check, Copy, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader, Shell } from "@/components/shell";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useMessages } from "@/i18n/client";
import { accountMessages } from "@/i18n/messages/account";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/use-report";

export default function AccountPage() {
  return (
    <Shell>
      <AccountHeader />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 py-6">
          <TwoFactor />
          <Profile />
          <Password />
        </div>
      </div>
    </Shell>
  );
}

function AccountHeader() {
  return <PageHeader title={useMessages(accountMessages).title} />;
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

const notify = (text: string, tone: "error" | "info" = "error") => useStore.getState().notify(text, tone);
const errText = (wrong: string, e: { message?: string; status?: number } | null | undefined, fallback: string) =>
  e?.status === 401 || /password/i.test(e?.message ?? "") ? wrong : e?.message || fallback;

/* ------------------------------------------------------------ two-factor */

type Step = { kind: "idle" } | { kind: "password"; action: "enable" | "disable" | "codes" } | { kind: "scan"; uri: string; codes: string[] } | { kind: "codes"; codes: string[] };

function TwoFactor() {
  const { me } = useMe();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const m = useMessages(accountMessages);
  const t = m.mfa;
  const enabled = !!me?.user.twoFactorEnabled;

  const done = async () => {
    setStep({ kind: "idle" });
    await useStore.getState().loadMe();
  };

  return (
    <Card
      title={t.title}
      aside={
        enabled ? (
          <span className="flex items-center gap-1 rounded-full border border-go-line bg-go-soft px-2 py-0.5 text-[11px] text-go-ink">
            <ShieldCheck size={12} /> {t.on}
          </span>
        ) : (
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-fg-3">{t.off}</span>
        )
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {me?.mfaRequired && (
          <p className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft px-3 py-2 text-[13px] text-amber-ink">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            {t.required}
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-fg-2">
          {t.intro}
        </p>
        <div className="flex gap-2">
          {enabled ? (
            <>
              <Button onClick={() => setStep({ kind: "password", action: "codes" })}>{t.newCodes}</Button>
              <Button variant="danger" onClick={() => setStep({ kind: "password", action: "disable" })}>
                {t.disable}
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={() => setStep({ kind: "password", action: "enable" })}>
              {t.enable}
            </Button>
          )}
        </div>
      </div>

      <PasswordDialog
        step={step}
        onCancel={() => setStep({ kind: "idle" })}
        onConfirmed={async (password, action) => {
          if (action === "enable") {
            const { data, error } = await authClient.twoFactor.enable({ password });
            if (error || !data || !("totpURI" in data)) throw new Error(errText(m.wrongPassword, error, t.enableFailed));
            setStep({ kind: "scan", uri: data.totpURI, codes: data.backupCodes });
          } else if (action === "disable") {
            const { error } = await authClient.twoFactor.disable({ password });
            if (error) throw new Error(errText(m.wrongPassword, error, t.disableFailed));
            notify(t.disabled, "info");
            await done();
          } else {
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
            if (error || !data) throw new Error(errText(m.wrongPassword, error, t.codesFailed));
            setStep({ kind: "codes", codes: data.backupCodes });
          }
        }}
      />
      {step.kind === "scan" && <ScanDialog uri={step.uri} codes={step.codes} onCancel={() => setStep({ kind: "idle" })} onDone={done} />}
      {step.kind === "codes" && (
        <Dialog open onOpenChange={() => setStep({ kind: "idle" })} title={t.newCodes} description={t.newCodesDesc}>
          <div className="p-5">
            <BackupCodes codes={step.codes} />
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={() => setStep({ kind: "idle" })}>
                {t.savedThem}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

function PasswordDialog({ step, onCancel, onConfirmed }: { step: Step; onCancel: () => void; onConfirmed: (password: string, action: "enable" | "disable" | "codes") => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const open = step.kind === "password";
  const t = useMessages(accountMessages).mfa;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setPassword("");
          setError(undefined);
          onCancel();
        }
      }}
      title={t.confirmTitle}
      description={t.confirmDesc}
      width={420}
    >
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (step.kind !== "password") return;
          setBusy(true);
          setError(undefined);
          try {
            await onConfirmed(password, step.action);
            setPassword("");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} aria-label={t.password} />
        {error && <p className="text-[13px] text-red-ink">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !password}>
            {t.continue}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ScanDialog({ uri, codes, onCancel, onDone }: { uri: string; codes: string[]; onCancel: () => void; onDone: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const t = useMessages(accountMessages).mfa;
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  const svg = renderSVG(uri, { border: 1, pixelSize: 5, whiteColor: "#ffffff", blackColor: "#0e0f11" });

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()} title={t.setupTitle} description={t.setupDesc} width={620}>
      <form
        className="flex flex-col gap-5 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
          setBusy(false);
          if (error) return setError(t.badCode);
          notify(t.enabled, "info");
          await onDone();
        }}
      >
        <Stepper n={1} title={t.step1}>
          <div className="flex items-start gap-4">
            <div className="shrink-0 overflow-hidden rounded-md border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} style={{ width: 168 }} />
            <div className="min-w-0 text-xs text-fg-3">
              <p>{t.cantScan}</p>
              <p className="mt-1.5 break-all rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-[12px] text-fg">{secret.replace(/(.{4})/g, "$1 ").trim()}</p>
            </div>
          </div>
        </Stepper>
        <Stepper n={2} title={t.step2}>
          <p className="mb-2 text-xs text-fg-3">{t.step2Hint}</p>
          <BackupCodes codes={codes} onSaved={() => setSaved(true)} />
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> {t.savedCheckbox}
          </label>
        </Stepper>
        <Stepper n={3} title={t.step3}>
          <div className="flex gap-2">
            <Input
              mono
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="max-w-[160px] text-center tracking-[0.2em]"
              aria-label={t.codeLabel}
            />
            <Button type="submit" variant="primary" disabled={busy || !saved || code.replace(/\s/g, "").length !== 6}>
              {t.activate}
            </Button>
          </div>
          {error && <p className="mt-2 text-[13px] text-red-ink">{error}</p>}
        </Stepper>
      </form>
    </Dialog>
  );
}

function Stepper({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[24px_1fr] gap-3">
      <span className="grid size-6 place-items-center rounded-full bg-sunken font-mono text-[11px] text-fg-2">{n}</span>
      <div>
        <p className="mb-2 text-[13px] font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

function BackupCodes({ codes, onSaved }: { codes: string[]; onSaved?: () => void }) {
  const [copied, setCopied] = useState(false);
  const t = useMessages(accountMessages).mfa;
  const text = codes.join("\n");
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[13px] sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          icon={copied ? <Check size={13} /> : <Copy size={13} />}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            onSaved?.();
          }}
        >
          {copied ? t.copied : t.copy}
        </Button>
        <Button
          type="button"
          size="sm"
          icon={<Download size={13} />}
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([`${t.fileTitle}\n\n${text}\n`], { type: "text/plain" }));
            a.download = t.fileName;
            a.click();
            URL.revokeObjectURL(a.href);
            onSaved?.();
          }}
        >
          {t.download}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ profile */

function Profile() {
  const { me } = useMe();
  const [name, setName] = useState(me?.user.name ?? "");
  const t = useMessages(accountMessages).profile;
  if (!me) return null;
  return (
    <Card title={t.title}>
      <form
        className="flex items-end gap-2 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await authClient.updateUser({ name: name.trim() });
          if (error) return notify(error.message ?? t.failed);
          await useStore.getState().loadMe();
          notify(t.saved, "info");
        }}
      >
        <Field label={t.name} className="flex-1">
          <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.email} className="flex-1">
          <Input value={me.user.email} readOnly disabled />
        </Field>
        <Button type="submit" variant="primary" disabled={!name.trim() || name === me.user.name}>
          {t.save}
        </Button>
      </form>
    </Card>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const m = useMessages(accountMessages);
  const t = m.password;
  const [busy, setBusy] = useState(false);
  return (
    <Card title={t.title}>
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
          setBusy(false);
          if (error) return notify(errText(m.wrongPassword, error, t.failed));
          setCurrent("");
          setNext("");
          notify(t.changed, "info");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.current}>
            <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label={t.next} hint={t.hint}>
            <Input type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" disabled={busy || !current || next.length < 10}>
            {t.change}
          </Button>
        </div>
      </form>
    </Card>
  );
}
