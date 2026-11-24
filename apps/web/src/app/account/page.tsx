"use client";

import { useState, type ReactNode } from "react";
import { renderSVG } from "uqr";
import { Check, Copy, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader, Shell } from "@/components/shell";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/use-report";

export default function AccountPage() {
  return (
    <Shell>
      <PageHeader title="Mon compte" />
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
const errText = (e: { message?: string; status?: number } | null | undefined, fallback: string) =>
  e?.status === 401 || /password/i.test(e?.message ?? "") ? "Mot de passe incorrect." : e?.message || fallback;

/* ------------------------------------------------------------ two-factor */

type Step = { kind: "idle" } | { kind: "password"; action: "enable" | "disable" | "codes" } | { kind: "scan"; uri: string; codes: string[] } | { kind: "codes"; codes: string[] };

function TwoFactor() {
  const { me } = useMe();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const enabled = !!me?.user.twoFactorEnabled;

  const done = async () => {
    setStep({ kind: "idle" });
    await useStore.getState().loadMe();
  };

  return (
    <Card
      title="Double authentification"
      aside={
        enabled ? (
          <span className="flex items-center gap-1 rounded-full border border-go-line bg-go-soft px-2 py-0.5 text-[11px] text-go">
            <ShieldCheck size={12} /> Activée
          </span>
        ) : (
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-fg-3">Désactivée</span>
        )
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {me?.mfaRequired && (
          <p className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft px-3 py-2 text-[13px] text-amber">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            Obligatoire pour votre rôle : sans elle, vous ne pouvez ni inviter, ni changer les rôles, ni signer de dérogation.
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-fg-2">
          À chaque connexion, PcyBox GoLive demande en plus de votre mot de passe un code à 6 chiffres généré par une application d'authentification (Google Authenticator,
          Microsoft Authenticator, 1Password, Bitwarden…). Un mot de passe volé ne suffit plus.
        </p>
        <div className="flex gap-2">
          {enabled ? (
            <>
              <Button onClick={() => setStep({ kind: "password", action: "codes" })}>Nouveaux codes de secours</Button>
              <Button variant="danger" onClick={() => setStep({ kind: "password", action: "disable" })}>
                Désactiver
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={() => setStep({ kind: "password", action: "enable" })}>
              Activer la double authentification
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
            if (error || !data || !("totpURI" in data)) throw new Error(errText(error, "Activation impossible."));
            setStep({ kind: "scan", uri: data.totpURI, codes: data.backupCodes });
          } else if (action === "disable") {
            const { error } = await authClient.twoFactor.disable({ password });
            if (error) throw new Error(errText(error, "Désactivation impossible."));
            notify("Double authentification désactivée.", "info");
            await done();
          } else {
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
            if (error || !data) throw new Error(errText(error, "Génération impossible."));
            setStep({ kind: "codes", codes: data.backupCodes });
          }
        }}
      />
      {step.kind === "scan" && <ScanDialog uri={step.uri} codes={step.codes} onCancel={() => setStep({ kind: "idle" })} onDone={done} />}
      {step.kind === "codes" && (
        <Dialog open onOpenChange={() => setStep({ kind: "idle" })} title="Nouveaux codes de secours" description="Les anciens codes ne fonctionnent plus.">
          <div className="p-5">
            <BackupCodes codes={step.codes} />
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={() => setStep({ kind: "idle" })}>
                Je les ai enregistrés
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
      title="Confirmez votre mot de passe"
      description="Par sécurité, cette action demande votre mot de passe."
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
        <Input type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Mot de passe" />
        {error && <p className="text-[13px] text-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !password}>
            Continuer
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
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  const svg = renderSVG(uri, { border: 1, pixelSize: 5, whiteColor: "#ffffff", blackColor: "#0e0f11" });

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()} title="Activer la double authentification" description="Trois étapes, une minute." width={620}>
      <form
        className="flex flex-col gap-5 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
          setBusy(false);
          if (error) return setError("Code incorrect. Vérifiez l'heure de votre téléphone et réessayez avec le code suivant.");
          notify("Double authentification activée.", "info");
          await onDone();
        }}
      >
        <Stepper n={1} title="Scannez ce QR code avec votre application d'authentification">
          <div className="flex items-start gap-4">
            <div className="shrink-0 overflow-hidden rounded-md border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} style={{ width: 168 }} />
            <div className="min-w-0 text-xs text-fg-3">
              <p>Impossible de scanner ? Saisissez cette clé dans l'application :</p>
              <p className="mt-1.5 break-all rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-[12px] text-fg">{secret.replace(/(.{4})/g, "$1 ").trim()}</p>
            </div>
          </div>
        </Stepper>
        <Stepper n={2} title="Gardez vos codes de secours en lieu sûr">
          <p className="mb-2 text-xs text-fg-3">Chacun remplace une fois l'application si vous perdez votre téléphone.</p>
          <BackupCodes codes={codes} onSaved={() => setSaved(true)} />
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> J'ai enregistré mes codes de secours
          </label>
        </Stepper>
        <Stepper n={3} title="Saisissez le code affiché par l'application">
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
              aria-label="Code à 6 chiffres"
            />
            <Button type="submit" variant="primary" disabled={busy || !saved || code.replace(/\s/g, "").length !== 6}>
              Activer
            </Button>
          </div>
          {error && <p className="mt-2 text-[13px] text-red">{error}</p>}
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
          {copied ? "Copiés" : "Copier"}
        </Button>
        <Button
          type="button"
          size="sm"
          icon={<Download size={13} />}
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([`Codes de secours PcyBox GoLive\n\n${text}\n`], { type: "text/plain" }));
            a.download = "pcybox-golive-codes-de-secours.txt";
            a.click();
            URL.revokeObjectURL(a.href);
            onSaved?.();
          }}
        >
          Télécharger
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ profile */

function Profile() {
  const { me } = useMe();
  const [name, setName] = useState(me?.user.name ?? "");
  if (!me) return null;
  return (
    <Card title="Profil">
      <form
        className="flex items-end gap-2 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await authClient.updateUser({ name: name.trim() });
          if (error) return notify(error.message ?? "Enregistrement impossible.");
          await useStore.getState().loadMe();
          notify("Profil enregistré.", "info");
        }}
      >
        <Field label="Nom" className="flex-1">
          <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail" className="flex-1">
          <Input value={me.user.email} readOnly disabled />
        </Field>
        <Button type="submit" variant="primary" disabled={!name.trim() || name === me.user.name}>
          Enregistrer
        </Button>
      </form>
    </Card>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Mot de passe">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
          setBusy(false);
          if (error) return notify(errText(error, "Changement impossible."));
          setCurrent("");
          setNext("");
          notify("Mot de passe changé. Vos autres sessions ont été déconnectées.", "info");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mot de passe actuel">
            <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="Nouveau mot de passe" hint="10 caractères minimum.">
            <Input type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" disabled={busy || !current || next.length < 10}>
            Changer le mot de passe
          </Button>
        </div>
      </form>
    </Card>
  );
}
