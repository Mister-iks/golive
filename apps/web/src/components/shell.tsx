"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpenText, FolderKanban, Laptop, Moon, Sun } from "lucide-react";
import { ENGINE_VERSION } from "@golive/engine";
import { Wordmark } from "./brand";
import { useTheme, type ThemePref } from "./providers";
import { cx, Tip } from "./ui";

const NAV = [
  { href: "/", label: "Projets", icon: FolderKanban, match: (p: string) => p === "/" || p.startsWith("/p/") },
  { href: "/rules", label: "Catalogue des règles", icon: BookOpenText, match: (p: string) => p.startsWith("/rules") },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="no-print flex w-[216px] shrink-0 flex-col border-r border-line bg-surface-2 max-md:hidden">
        <div className="flex h-12 items-center px-4">
          <Link href="/" aria-label="GoLive, accueil">
            <Wordmark />
          </Link>
        </div>
        <div className="px-3 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5">
            <span className="grid size-5 place-items-center rounded bg-fg font-mono text-[10px] font-semibold text-bg">L</span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium">Espace local</p>
              <p className="text-[10.5px] text-fg-3">Community · ce navigateur</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-px px-2 py-2">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(path);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                  active ? "bg-sunken font-medium text-fg" : "text-fg-2 hover:bg-sunken/70 hover:text-fg",
                )}
              >
                <Icon size={15} strokeWidth={1.75} className={active ? "text-fg" : "text-fg-3"} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-line p-3">
          <ThemeSwitch />
          <div className="flex items-center justify-between px-1 text-[11px] text-fg-3">
            <span>
              Community <span className="font-mono">{ENGINE_VERSION}</span>
            </span>
            <Tip label="Code source">
              <a href="https://github.com/Mister-iks/golive" target="_blank" rel="noreferrer" className="hover:text-fg" aria-label="Code source sur GitHub">
                <GithubIcon />
              </a>
            </Tip>
          </div>
        </div>
      </aside>
      <main className="print-root flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

function ThemeSwitch() {
  const { pref, set } = useTheme();
  const opts: { v: ThemePref; icon: typeof Sun; label: string }[] = [
    { v: "system", icon: Laptop, label: "Système" },
    { v: "light", icon: Sun, label: "Clair" },
    { v: "dark", icon: Moon, label: "Sombre" },
  ];
  return (
    <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 rounded-md border border-line bg-surface p-0.5">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          onClick={() => set(v)}
          className={cx("grid h-6 place-items-center rounded-[5px] transition-colors", pref === v ? "bg-sunken text-fg" : "text-fg-3 hover:text-fg")}
        >
          <Icon size={13} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, children, crumbs }: { title: ReactNode; children?: ReactNode; crumbs?: ReactNode }) {
  return (
    <header className="no-print flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        {crumbs}
        <h1 className="truncate font-medium">{title}</h1>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}

function GithubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
