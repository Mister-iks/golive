import type { ReactNode } from "react";
import { Wordmark } from "./brand";

const SAMPLE: [string, "ok" | "ko" | "proof", string][] = [
  ["ok", "ok", "TLS 1.3, certificat valide 74 jours"],
  ["ko", "ko", "Base PostgreSQL exposée sur Internet"],
  ["ok", "ok", "Aucun secret dans le dépôt"],
  ["proof", "proof", "Restauration de sauvegarde testée"],
  ["ko", "ko", "Traceur chargé avant consentement"],
  ["ok", "ok", "20 pages parcourues, 0 lien cassé"],
];

/** Sign-in, sign-up and invitation pages share this frame. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Wordmark />
        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-3">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-[13px] text-fg-3">{footer}</div>}
        </div>
        <p className="text-[11px] text-fg-4">Édition Community · open source · auto-hébergée</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface-2 lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:14px_14px] opacity-70" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-go">Go / No-Go</p>
          <p className="mt-3 max-w-md text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">Le feu vert avant toute mise en production.</p>
          <div className="mt-8 max-w-md overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_0_var(--line),0_18px_40px_-24px_rgb(0_0_0/0.35)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[11px] text-fg-3">golive check --repo . --url https://…</span>
              <span className="rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-medium text-red">No-Go</span>
            </div>
            <ul className="divide-y divide-line">
              {SAMPLE.map(([k, tone, text]) => (
                <li key={text} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                  <span className={tone === "ok" ? "text-go" : tone === "ko" ? "text-red" : "text-amber"}>{k === "ok" ? "✓" : k === "ko" ? "✕" : "◐"}</span>
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
