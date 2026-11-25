"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/use-report";
import { useMessages } from "@/i18n/client";
import { shellMessages } from "@/i18n/messages/shell";
import { cx } from "./ui";

/** Organization role names in the current language. */
export const useOrgRoleLabels = () => useMessages(shellMessages).orgRoles;

function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cx("grid size-5 shrink-0 place-items-center rounded bg-fg font-mono text-[10px] font-semibold uppercase text-bg", className)}>
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

/** Community runs one organization per installation. */
export function OrgSwitcher() {
  const { me, org } = useMe();
  const t = useMessages(shellMessages);
  if (!me) return <div className="h-[42px] rounded-md border border-line bg-surface" />;
  if (!org) {
    return (
      <div className="rounded-md border border-dashed border-line px-2.5 py-1.5 text-[11px] leading-snug text-fg-3">
        {t.noOrg}
      </div>
    );
  }
  return (
    <Link href="/settings" className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-left hover:border-line-strong">
      <Initial name={org.name} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-medium">{org.name}</p>
        <p className="text-[10.5px] text-fg-3">{t.orgRoles[org.role]}</p>
      </div>
    </Link>
  );
}

export function UserMenu() {
  const { me } = useMe();
  const t = useMessages(shellMessages);
  if (!me) return null;
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold uppercase text-fg-2">
        {me.user.name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")}
      </span>
      <Link href="/account" className="min-w-0 flex-1 rounded leading-tight hover:opacity-80" title={t.myAccount}>
        <p className="truncate text-xs font-medium">{me.user.name}</p>
        <p className="truncate text-[10.5px] text-fg-3">{me.user.email}</p>
      </Link>
      <button
        onClick={async () => {
          await authClient.signOut();
          location.assign("/login");
        }}
        className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-sunken hover:text-fg"
        aria-label={t.signOut}
        title={t.signOut}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

export function Toast() {
  const t = useMessages(shellMessages);
  const notice = useStore((s) => s.notice);
  const [shown, setShown] = useState<typeof notice>();
  useEffect(() => {
    if (!notice) return;
    setShown(notice);
    const t = setTimeout(() => setShown(undefined), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!shown) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-[rise_180ms_ease-out]">
      <div
        className={cx(
          "flex max-w-[560px] items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-pop",
          shown.tone === "error" ? "border-red-line bg-surface text-fg" : "border-line bg-surface text-fg",
        )}
      >
        <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", shown.tone === "error" ? "bg-red" : "bg-go")} />
        <span className="flex-1">{shown.text}</span>
        <button onClick={() => setShown(undefined)} className="text-fg-3 hover:text-fg" aria-label={t.close}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
