"use client";

import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { cx } from "./ui";

export function MenuItem({ children, icon, onSelect, danger }: { children: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cx(
        "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-sunken",
        danger ? "text-red" : "text-fg",
      )}
    >
      <span className={danger ? "" : "text-fg-3"}>{icon}</span>
      {children}
    </DropdownMenu.Item>
  );
}

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={4} className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-pop">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-line" />;
