import type { HTMLAttributes } from "react";

export type BadgeTone = "success" | "info" | "danger" | "neutral";

const TONES: Record<BadgeTone, { pill: string; dot: string }> = {
  success: { pill: "bg-green-soft text-green", dot: "bg-green" },
  info: { pill: "bg-purple-soft text-purple", dot: "bg-purple" },
  danger: {
    pill: "text-danger [background:color-mix(in_srgb,var(--danger)_15%,transparent)]",
    dot: "bg-danger",
  },
  neutral: { pill: "bg-surface-2 text-muted", dot: "bg-faint" },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Punto de estado a la izquierda (por defecto visible). */
  dot?: boolean;
}

export function Badge({ tone = "neutral", dot = true, className = "", children, ...props }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-[5px] text-xs font-semibold ${t.pill} ${className}`}
      {...props}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-pill ${t.dot}`} />}
      {children}
    </span>
  );
}
