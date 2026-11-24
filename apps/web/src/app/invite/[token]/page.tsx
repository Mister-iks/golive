"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

interface Preview {
  org: string;
  inviter: string | null;
  email: string;
  projects: number;
  accepted: boolean;
  expired: boolean;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const session = authClient.useSession();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const here = `/invite/${token}`;

  useEffect(() => {
    fetch(`/api/invitations/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setPreview(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ orgId: string; projectId?: string }>(`/invitations/${encodeURIComponent(token)}`, { method: "POST" });
      try {
        localStorage.setItem("golive.org", r.orgId);
      } catch {}
      location.assign(r.projectId ? `/p/${r.projectId}` : "/");
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };

  if (error && !preview) {
    return (
      <AuthFrame title="Invitation indisponible" subtitle={error} footer={<Link href="/login" className="font-medium text-fg hover:underline">Aller à la connexion</Link>}>
        {null}
      </AuthFrame>
    );
  }
  if (!preview || session.isPending) return <AuthFrame title="Invitation">{null}</AuthFrame>;

  const user = session.data?.user;
  const wrongAccount = user && user.email.toLowerCase() !== preview.email;
  const subtitle = (
    <>
      {preview.inviter ?? "Un administrateur"} vous invite à rejoindre <strong className="font-medium text-fg">{preview.org}</strong>
      {preview.projects ? ` (${preview.projects} projet${preview.projects > 1 ? "s" : ""})` : ""} sur PcyBox GoLive. Invitation destinée à <span className="font-mono text-fg-2">{preview.email}</span>.
    </>
  );

  if (preview.accepted || preview.expired) {
    return (
      <AuthFrame title={preview.accepted ? "Invitation déjà utilisée" : "Invitation expirée"} subtitle={preview.accepted ? "Connectez-vous pour accéder à l'organisation." : "Demandez à la personne qui vous a invité de vous renvoyer un lien."}>
        <Link href="/login">
          <Button variant="primary" size="lg" className="w-full">
            Se connecter
          </Button>
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Rejoindre l'équipe" subtitle={subtitle}>
      <div className="flex flex-col gap-3">
        {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red">{error}</p>}
        {!user ? (
          <>
            <Link href={`/signup?${new URLSearchParams({ next: here, email: preview.email })}`}>
              <Button variant="primary" size="lg" className="w-full">
                Créer mon compte
              </Button>
            </Link>
            <Link href={`/login?${new URLSearchParams({ next: here, email: preview.email })}`}>
              <Button size="lg" className="w-full">
                J'ai déjà un compte
              </Button>
            </Link>
          </>
        ) : wrongAccount ? (
          <>
            <p className="text-[13px] text-fg-2">
              Vous êtes connecté avec <span className="font-mono">{user.email}</span>. Cette invitation est destinée à <span className="font-mono">{preview.email}</span>.
            </p>
            <Button
              size="lg"
              onClick={async () => {
                await authClient.signOut();
                location.assign(`/login?${new URLSearchParams({ next: here, email: preview.email })}`);
              }}
            >
              Changer de compte
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void accept()}>
            Accepter l'invitation
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}
