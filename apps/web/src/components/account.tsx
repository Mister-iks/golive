"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronsUpDown, LogOut, Plus, Settings, X } from "lucide-react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/use-report";
import { MenuItem } from "./menu";
import { Button, cx, Dialog, Field, Input } from "./ui";

export const ORG_ROLE_LABEL = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", guest: "Invité" } as const;

function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cx("grid size-5 shrink-0 place-items-center rounded bg-fg font-mono text-[10px] font-semibold uppercase text-bg", className)}>
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

export function OrgSwitcher() {
  const { me, org } = useMe();
  const setOrg = useStore((s) => s.setOrg);
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  if (!me || !org) return <div className="h-[42px] rounded-md border border-line bg-surface" />;

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-left hover:border-line-strong">
            <Initial name={org.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{org.name}</p>
              <p className="text-[10.5px] text-fg-3">{ORG_ROLE_LABEL[org.role]}</p>
            </div>
            <ChevronsUpDown size={13} className="shrink-0 text-fg-3" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className="z-50 w-[240px] rounded-lg border border-line bg-surface p-1 shadow-pop">
            <DropdownMenu.Label className="px-2 pb-1 pt-1.5 text-[11px] text-fg-3">Organisations</DropdownMenu.Label>
            {me.orgs.map((o) => (
              <DropdownMenu.Item
                key={o.id}
                onSelect={() => {
                  setOrg(o.id);
                  router.push("/");
                }}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-sunken"
              >
                <Initial name={o.name} />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.id === org.id && <Check size={14} className="text-fg-2" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <MenuItem icon={<Settings size={14} />} onSelect={() => router.push("/settings")}>
              Membres et réglages
            </MenuItem>
            <MenuItem icon={<Plus size={14} />} onSelect={() => setCreating(true)}>
              Nouvelle organisation
            </MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <NewOrgDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function NewOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const submit = async () => {
    setBusy(true);
    try {
      const org = await api<{ id: string }>("/orgs", { body: { name } });
      await useStore.getState().loadMe();
      useStore.getState().setOrg(org.id);
      onOpenChange(false);
      setName("");
      router.push("/settings");
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nouvelle organisation" description="Une agence, une entreprise, un ministère : chaque organisation a ses propres projets et membres." width={440}>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Nom">
          <Input autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Agence Teranga Digital" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            Créer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function UserMenu() {
  const { me } = useMe();
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
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-medium">{me.user.name}</p>
        <p className="truncate text-[10.5px] text-fg-3">{me.user.email}</p>
      </div>
      <button
        onClick={async () => {
          await authClient.signOut();
          location.assign("/login");
        }}
        className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-sunken hover:text-fg"
        aria-label="Se déconnecter"
        title="Se déconnecter"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

export function Toast() {
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
        <button onClick={() => setShown(undefined)} className="text-fg-3 hover:text-fg" aria-label="Fermer">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
