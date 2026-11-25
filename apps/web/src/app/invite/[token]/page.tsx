"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { authMessages } from "@/i18n/messages/auth";
import { api, ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

interface Preview {
  org: string;
  inviter: string | null;
  email: string;
  accepted: boolean;
  expired: boolean;
}

export default function InvitePage() {
  const t = useMessages(authMessages).invite;
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
      const r = await api<{ orgId: string }>(`/invitations/${encodeURIComponent(token)}`, { method: "POST" });
      try {
        localStorage.setItem("golive.org", r.orgId);
      } catch {}
      location.assign("/");
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };

  if (error && !preview) {
    return (
      <AuthFrame
        title={t.unavailable}
        subtitle={error}
        footer={
          <Link href="/login" className="font-medium text-fg hover:underline">
            {t.goToSignIn}
          </Link>
        }
      >
        {null}
      </AuthFrame>
    );
  }
  if (!preview || session.isPending) return <AuthFrame title={t.title}>{null}</AuthFrame>;

  const user = session.data?.user;
  const wrongAccount = user && user.email.toLowerCase() !== preview.email;
  const s = t.invites(preview.inviter, preview.org, preview.email);
  const subtitle = (
    <>
      {s.before}
      <strong className="font-medium text-fg">{s.org}</strong>
      {s.after}
      <span className="font-mono text-fg-2">{s.email}</span>
      {s.end}
    </>
  );

  if (preview.accepted || preview.expired) {
    return (
      <AuthFrame title={preview.accepted ? t.usedTitle : t.expiredTitle} subtitle={preview.accepted ? t.usedBody : t.expiredBody}>
        <Link href="/login">
          <Button variant="primary" size="lg" className="w-full">
            {t.signIn}
          </Button>
        </Link>
      </AuthFrame>
    );
  }

  const w = user ? t.wrongAccount(user.email, preview.email) : undefined;

  return (
    <AuthFrame title={t.join} subtitle={subtitle}>
      <div className="flex flex-col gap-3">
        {error && <p className="rounded-md border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red-ink">{error}</p>}
        {!user ? (
          <>
            <Link href={`/signup?${new URLSearchParams({ next: here, email: preview.email })}`}>
              <Button variant="primary" size="lg" className="w-full">
                {t.createAccount}
              </Button>
            </Link>
            <Link href={`/login?${new URLSearchParams({ next: here, email: preview.email })}`}>
              <Button size="lg" className="w-full">
                {t.haveAccount}
              </Button>
            </Link>
          </>
        ) : wrongAccount && w ? (
          <>
            <p className="text-[13px] text-fg-2">
              {w.a}
              <span className="font-mono">{w.current}</span>
              {w.b}
              <span className="font-mono">{w.wanted}</span>
              {w.c}
            </p>
            <Button
              size="lg"
              onClick={async () => {
                await authClient.signOut();
                location.assign(`/login?${new URLSearchParams({ next: here, email: preview.email })}`);
              }}
            >
              {t.switchAccount}
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void accept()}>
            {t.accept}
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}
