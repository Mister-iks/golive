"use client";

import type { ReactNode } from "react";
import { useMessages } from "@/i18n/client";
import { shellMessages } from "@/i18n/messages/shell";
import { Wordmark } from "./brand";
import { LangSwitch } from "./lang-switch";

/** Sign-in, sign-up and invitation pages share this frame. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const t = useMessages(shellMessages).auth;
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Wordmark />
          <LangSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-3">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-[13px] text-fg-3">{footer}</div>}
        </div>
        <p className="text-[11px] text-fg-4">{t.footer}</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface-2 lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:14px_14px] opacity-70" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-go">{t.kicker}</p>
          <p className="mt-3 max-w-md text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">{t.headline}</p>
          <div className="mt-8 max-w-md overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_0_var(--line),0_18px_40px_-24px_rgb(0_0_0/0.35)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[11px] text-fg-3">golive check --repo . --url https://…</span>
              <span className="rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-medium text-red">No-Go</span>
            </div>
            <ul className="divide-y divide-line">
              {t.sample.map(([tone, text]) => (
                <li key={text} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                  <span className={tone === "ok" ? "text-go" : tone === "ko" ? "text-red" : "text-amber"}>{tone === "ok" ? "✓" : tone === "ko" ? "✕" : "◐"}</span>
                  <span className="text-fg-2">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
