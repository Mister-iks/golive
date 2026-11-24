import { cx } from "./ui";

/** The GoLive shield, drawn as SVG so it stays crisp and follows the theme. */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2.2c-2.3 1.15-4.8 1.65-7.6 1.65v6.6c0 5.05 2.9 8.75 7.6 11.1 4.7-2.35 7.6-6.05 7.6-11.1v-6.6c-2.8 0-5.3-.5-7.6-1.65Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m8.1 12.3 2.25 2.25 5-5" stroke="var(--go)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6 9.55h2.75v2.75" stroke="var(--go)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-fg", className)}>
      <Mark size={20} />
      <span className="font-brand text-[15px] font-semibold tracking-[-0.01em]">GoLive</span>
    </span>
  );
}
