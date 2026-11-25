"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Field, Input } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { authMessages } from "@/i18n/messages/auth";
import { authClient, safeNext } from "@/lib/auth-client";

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const m = useMessages(authMessages);
  const t = m.signup;
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const invited = params.get("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(invited ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
    setBusy(false);
    if (error) {
      if (error.code === "USER_ALREADY_EXISTS" || error.status === 422) return setError(t.exists);
      if (error.code === "PASSWORD_TOO_SHORT") return setError(t.tooShort);
      return setError(error.message ?? t.failed);
    }
    location.assign(next);
  };

  return (
    <AuthFrame
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <>
          {t.already}{" "}
          <Link href={`/login?${new URLSearchParams({ ...(next !== "/" ? { next } : {}), ...(email ? { email } : {}) })}`} className="font-medium text-fg underline-offset-2 hover:underline">
            {t.signIn}
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t.name}>
          <Input autoComplete="name" required autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} />
        </Field>
        <Field label={t.workEmail}>
          <Input type="email" autoComplete="email" required value={email} readOnly={!!invited} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={m.password} hint={t.passwordHint}>
          <Input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red">{error}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {t.submit}
        </Button>
      </form>
    </AuthFrame>
  );
}
