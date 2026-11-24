"use client";

import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Dialog as RDialog, Popover as RPopover, Tooltip as RTooltip } from "radix-ui";
import { X } from "lucide-react";
import type { Decision } from "@golive/engine";
import type { Severity, Status } from "@golive/packs-sdk";

export const cx = clsx;

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-7 px-2.5 text-xs" : size === "lg" ? "h-9 px-3.5 text-[13.5px]" : "h-8 px-3 text-[13px]",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "secondary" && "border border-line-strong bg-surface text-fg shadow-[0_1px_0_rgb(0_0_0/0.03)] hover:bg-surface-2",
        variant === "ghost" && "text-fg-2 hover:bg-sunken hover:text-fg",
        variant === "danger" && "border border-red-line bg-red-soft text-red hover:brightness-95",
        !children && (size === "sm" ? "w-7 px-0" : "w-8 px-0"),
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/* ---------------------------------------------------------------- Inputs */

const field =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-4 outline-none transition-colors hover:border-fg-4 focus:border-fg-3 focus-visible:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--go)_25%,transparent)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function Input(
  { className, mono, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(field, "h-8", mono && "font-mono text-xs", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(field, "h-8 appearance-none bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-7", className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  );
}
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2385878e' stroke-width='2'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E")`;

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(field, "min-h-16 resize-y py-1.5 leading-relaxed", className)} {...rest} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-2xs text-fg-3">{hint}</span>}
    </label>
  );
}

/* ---------------------------------------------------------- Signal atoms */

export const SEVERITY_LABEL: Record<Severity, string> = { blocker: "Bloquant", major: "Majeur", minor: "Mineur", info: "Info" };
export const STATUS_LABEL: Record<Status, string> = {
  pass: "OK",
  warn: "Avertissement",
  fail: "Échec",
  na: "Non applicable",
  evidence: "Preuve requise",
  "not-run": "Non exécuté",
};

export function SeverityTag({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center rounded px-1.5 font-mono text-[10px] font-medium uppercase tracking-wide",
        severity === "blocker" && "bg-red-soft text-red",
        severity === "major" && "bg-amber-soft text-amber",
        severity === "minor" && "bg-sunken text-fg-2",
        severity === "info" && "bg-sunken text-fg-3",
        className,
      )}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function StatusIcon({ status, size = 14, className }: { status: Status; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", className: cx("shrink-0", className), "aria-label": STATUS_LABEL[status], role: "img" as const };
  switch (status) {
    case "pass":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="var(--go)" />
          <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--surface)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "fail":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="var(--red)" />
          <path d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8" stroke="var(--surface)" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="M8 1.6 15 14H1L8 1.6Z" fill="var(--amber)" strokeLinejoin="round" />
          <path d="M8 6.2v3.4" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="0.9" fill="var(--surface)" />
        </svg>
      );
    case "evidence":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--blue)" strokeWidth="1.6" strokeDasharray="2.6 1.9" />
          <circle cx="8" cy="8" r="2.2" fill="var(--blue)" />
        </svg>
      );
    case "not-run":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--fg-4)" strokeWidth="1.4" strokeDasharray="1.6 2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4.5 8h7" stroke="var(--fg-4)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

export const DECISION_LABEL: Record<Decision, string> = { go: "Go", conditional: "Go conditionnel", "no-go": "No-Go" };

export function VerdictPill({ decision, size = "md", className }: { decision: Decision; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        decision === "go" && "border-go-line bg-go-soft text-go",
        decision === "conditional" && "border-amber-line bg-amber-soft text-amber",
        decision === "no-go" && "border-red-line bg-red-soft text-red",
        className,
      )}
    >
      <span className={cx("size-1.5 rounded-full", decision === "go" ? "bg-go" : decision === "conditional" ? "bg-amber" : "bg-red")} />
      {DECISION_LABEL[decision]}
    </span>
  );
}

/** A thin arc gauge, like an instrument dial. */
export function ScoreGauge({ value, threshold, size = 44 }: { value: number; threshold?: number; size?: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const arc = 0.75; // 270° dial
  const color = value >= (threshold ?? 80) ? "var(--go)" : value >= 50 ? "var(--amber)" : "var(--red)";
  const tAngle = threshold !== undefined ? 135 + (threshold / 100) * 270 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`Score ${value} sur 100`}>
      <g transform="rotate(135 20 20)">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="3" strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${c * arc * (value / 100)} ${c}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 400ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </g>
      {threshold !== undefined && (
        <line
          x1="20"
          y1="2.5"
          x2="20"
          y2="6.5"
          stroke="var(--fg-3)"
          strokeWidth="1.2"
          transform={`rotate(${tAngle + 90} 20 20)`}
        />
      )}
      <text x="20" y="23.5" textAnchor="middle" className="tnum" fontSize="11" fontWeight="600" fill="var(--fg)">
        {value}
      </text>
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-fg-3">
      {children}
    </kbd>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[11.5px]", className)}>{children}</span>;
}

/* --------------------------------------------------------- Overlays */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 520,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] data-[state=open]:animate-[fade_120ms_ease-out]" />
        <RDialog.Content
          className="fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-auto rounded-xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-[pop_160ms_cubic-bezier(.2,.8,.2,1)]"
          style={{ maxWidth: width }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RDialog.Title className="text-[15px] font-semibold tracking-tight">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-0.5 text-[13px] text-fg-3">{description}</RDialog.Description>}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="sm" icon={<X size={15} />} aria-label="Fermer" />
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Popover({ trigger, children, align = "end", width = 320 }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" | "center"; width?: number }) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          align={align}
          sideOffset={6}
          className="z-50 rounded-lg border border-line bg-surface p-3 shadow-pop outline-none data-[state=open]:animate-[pop_140ms_cubic-bezier(.2,.8,.2,1)]"
          style={{ width }}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export function Tip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-50 max-w-64 rounded-md bg-fg px-2 py-1 text-[11.5px] leading-snug text-bg">
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export { RTooltip as TooltipPrimitive };

/* --------------------------------------------------------------- Layout */

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">{children}</h3>
      {aside}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-9 place-items-center rounded-lg border border-line bg-surface text-fg-3">{icon}</div>}
      <p className="text-[13px] font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-fg-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
