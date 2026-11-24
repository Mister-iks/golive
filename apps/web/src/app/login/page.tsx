"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Field, Input } from "@/components/ui";
import { authClient, safeNext } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [config, setConfig] = useState<{ mail: boolean; signup: "open" | "invite" }>();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) return setError(error.status === 401 ? "E-mail ou mot de passe incorrect." : error.message ?? "Connexion impossible.");
    location.assign(next);
  };

  const magic = async () => {
    if (!email) return setError("Saisissez votre e-mail d'abord.");
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    setBusy(false);
    if (error) return setError(error.message ?? "Envoi impossible.");
    setInfo(`Si un compte existe pour ${email}, un lien de connexion valable 10 minutes vient d'être envoyé.`);
  };

  return (
    <AuthFrame
      title="Connexion"
      subtitle="Retrouvez vos projets et leurs verdicts."
      footer={
        config?.signup !== "invite" && (
          <>
            Pas encore de compte ?{" "}
            <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-fg underline-offset-2 hover:underline">
              Créer un compte
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
        <Field label="E-mail">
          <Input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red">{error}</p>}
        {info && <p className="rounded-md border border-go-line bg-go-soft px-3 py-2 text-[13px] text-go">{info}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Se connecter
        </Button>
        {config?.mail && (
          <Button type="button" size="lg" disabled={busy} onClick={() => void magic()}>
            Recevoir un lien par e-mail
          </Button>
        )}
      </form>
    </AuthFrame>
  );
}
