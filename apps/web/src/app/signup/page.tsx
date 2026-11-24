"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Field, Input } from "@/components/ui";
import { authClient, safeNext } from "@/lib/auth-client";

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  );
}

function Signup() {
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
      if (error.code === "USER_ALREADY_EXISTS" || error.status === 422) return setError("Un compte existe déjà avec cet e-mail. Connectez-vous.");
      if (error.code === "PASSWORD_TOO_SHORT") return setError("Le mot de passe doit faire au moins 10 caractères.");
      return setError(error.message ?? "Inscription impossible.");
    }
    location.assign(next);
  };

  return (
    <AuthFrame
      title="Créer un compte"
      subtitle="Un espace est créé pour vous. Vous pourrez y inviter votre équipe et vos clients."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href={`/login?${new URLSearchParams({ ...(next !== "/" ? { next } : {}), ...(email ? { email } : {}) })}`} className="font-medium text-fg underline-offset-2 hover:underline">
            Se connecter
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
        <Field label="Nom">
          <Input autoComplete="name" required autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Awa Ndiaye" />
        </Field>
        <Field label="E-mail professionnel">
          <Input type="email" autoComplete="email" required value={email} readOnly={!!invited} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe" hint="10 caractères minimum. Une phrase de passe est plus simple à retenir.">
          <Input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red">{error}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Créer mon compte
        </Button>
      </form>
    </AuthFrame>
  );
}
