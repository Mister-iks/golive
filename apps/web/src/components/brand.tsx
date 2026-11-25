import { cx } from "./ui";

/** The PcyBox GoLive shield, drawn as SVG so it stays crisp and follows the theme. */
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

/** Product name, always written "PcyBox GoLive". */
export const PRODUCT = "PcyBox GoLive";

export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-fg", className)}>
      <Mark size={size === "lg" ? 22 : 20} />
      <span className={cx("font-brand font-semibold tracking-[-0.01em]", size === "lg" ? "text-[16px]" : "text-[15px]")}>
        <span className="text-fg-2">PcyBox</span> GoLive
      </span>
    </span>
  );
}
