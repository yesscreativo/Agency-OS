import type { HTMLAttributes, ReactNode } from "react";

export type CardVariant = "flat" | "raised" | "overlay" | "active";

const VARIANTS: Record<CardVariant, string> = {
  flat: "bg-surface border border-line",
  raised: "bg-surface border border-line shadow-raised",
  overlay: "bg-elev border border-line shadow-overlay",
  // Tarjeta activa: se rellena de verde (tarea en curso, destacado)
  active: "bg-green text-green-ink border border-transparent",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ variant = "flat", className = "", ...props }: CardProps) {
  return <div className={`rounded-lg p-[22px] ${VARIANTS[variant]} ${className}`} {...props} />;
}

export type KpiTone = "green" | "purple" | "warn" | "danger" | "neutral";

/** Punto de color del tono, para las líneas de importe del `sub`. */
export function KpiDot({ tone = "neutral" }: { tone?: KpiTone }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${KPI_TONES[tone].dot}`} />;
}

const KPI_TONES: Record<KpiTone, { iconWrap: string; dot: string; ring: string }> = {
  green: {
    iconWrap: "bg-green-soft text-green",
    dot: "bg-green",
    ring: "[border-color:color-mix(in_srgb,var(--green)_55%,transparent)]",
  },
  purple: {
    iconWrap: "[background:color-mix(in_srgb,var(--purple)_14%,transparent)] text-purple",
    dot: "bg-purple",
    ring: "[border-color:color-mix(in_srgb,var(--purple)_55%,transparent)]",
  },
  warn: {
    iconWrap: "[background:color-mix(in_srgb,var(--warn)_14%,transparent)] text-warn",
    dot: "bg-warn",
    ring: "[border-color:color-mix(in_srgb,var(--warn)_55%,transparent)]",
  },
  danger: {
    iconWrap: "[background:color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger",
    dot: "bg-danger",
    ring: "[border-color:color-mix(in_srgb,var(--danger)_55%,transparent)]",
  },
  neutral: {
    iconWrap: "bg-surface-2 text-muted",
    dot: "bg-faint",
    ring: "border-line-strong",
  },
};

export interface KpiCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  /** Línea secundaria bajo el valor, p. ej. una suma de dinero. */
  sub?: ReactNode;
  /** Icono de la métrica; activa el layout rico (círculo tintado + divisor + dot). */
  icon?: ReactNode;
  /** Colorea el círculo del icono, el dot del sub y el borde de highlight. */
  tone?: KpiTone;
  /** Borde del tono + sombra para destacar la card principal. */
  highlight?: boolean;
  /** Variación, p. ej. "+12%". */
  delta?: string;
  /** Progreso 0–100 para la barra inferior. */
  progress?: number;
}

export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  highlight = false,
  delta,
  progress,
  className = "",
  ...props
}: KpiCardProps) {
  const toneStyles = KPI_TONES[tone];

  if (icon) {
    return (
      <div
        className={`relative rounded-lg border bg-glass p-5 backdrop-blur-xl transition hover:border-line-strong ${
          highlight ? `${toneStyles.ring} shadow-raised` : "border-line"
        } ${className}`}
        {...props}
      >
        <div
          className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-pill ${toneStyles.iconWrap}`}
        >
          {icon}
        </div>
        <div className="pr-10 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {label}
        </div>
        <div className="mt-1.5 text-[38px] font-bold leading-none tracking-tight text-ink">
          {value}
        </div>
        {sub != null && (
          <div className="mt-4 space-y-1 border-t border-line pt-3">{sub}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-line bg-glass p-[22px] backdrop-blur-xl ${className}`}
      {...props}
    >
      <div className="flex items-start justify-between">
        <div className="text-[13px] text-muted">{label}</div>
        {delta && (
          <span className="rounded-pill bg-green-soft px-2 py-[3px] text-xs font-semibold text-green">
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-[44px] font-bold leading-none tracking-tight text-ink">{value}</div>
      {sub != null && <div className="mt-2 font-mono text-sm text-muted">{sub}</div>}
      {progress != null && (
        <div className="mt-3.5 h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div
            className="h-full bg-green"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
