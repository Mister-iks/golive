"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Field, Input } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { authMessages } from "@/i18n/messages/auth";
import { authClient, safeNext } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const m = useMessages(authMessages);
  const t = m.login;
  const s2 = m.second;
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [config, setConfig] = useState<{ mail: boolean; signup: "first" | "invite" }>();
  const [second, setSecond] = useState(false);
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const { data, error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) return setError(error.status === 401 ? t.wrong : error.message ?? t.failed);
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setPassword("");
      return setSecond(true);
    }
    location.assign(next);
  };

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    const value = code.replace(/\s/g, "");
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust });
    setBusy(false);
    if (error) return setError(backup ? s2.backupWrong : s2.totpWrong);
    location.assign(next);
  };

  if (second) {
    return (
      <AuthFrame title={s2.title} subtitle={backup ? s2.backupSubtitle : s2.totpSubtitle}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <Input
            mono
            autoFocus
            required
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            placeholder={backup ? "xxxxx-xxxxx" : "123 456"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-10 text-center text-[16px] tracking-[0.2em]"
            aria-label={backup ? s2.backupLabel : s2.totpLabel}
          />
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} /> {s2.trust}
          </label>
          {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red-ink">{error}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={busy || !code.trim()}>
            {s2.verify}
          </Button>
          <button
            type="button"
            className="text-[13px] text-fg-3 underline-offset-2 hover:text-fg hover:underline"
            onClick={() => {
              setBackup((b) => !b);
              setCode("");
              setError(undefined);
            }}
          >
            {backup ? s2.useApp : s2.useBackup}
          </button>
        </form>
      </AuthFrame>
    );
  }

  const magic = async () => {
    if (!email) return setError(t.emailFirst);
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    setBusy(false);
    if (error) return setError(error.message ?? t.sendFailed);
    setInfo(t.linkSent(email));
  };

  return (
    <AuthFrame
      title={t.title}
      subtitle={t.subtitle}
      footer={
        config?.signup === "first" && (
          <>
            {t.firstTime}{" "}
            <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-fg underline-offset-2 hover:underline">
              {t.createAccount}
            </Link>
          </>
        )
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={m.email}>
          <Input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={m.password}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red-ink">{error}</p>}
        {info && <p className="rounded-md border border-go-line bg-go-soft px-3 py-2 text-[13px] text-go-ink">{info}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {t.submit}
        </Button>
        {config?.mail && (
          <Button type="button" size="lg" disabled={busy} onClick={() => void magic()}>
            {t.magic}
          </Button>
        )}
      </form>
    </AuthFrame>
  );
}
