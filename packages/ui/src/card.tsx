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

export interface KpiCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  /** Variación, p. ej. "+12%". */
  delta?: string;
  /** Progreso 0–100 para la barra inferior. */
  progress?: number;
}

export function KpiCard({ label, value, delta, progress, className = "", ...props }: KpiCardProps) {
  return (
    <div className={`rounded-lg border border-line bg-surface p-[22px] ${className}`} {...props}>
      <div className="flex items-start justify-between">
        <div className="text-[13px] text-muted">{label}</div>
        {delta && (
          <span className="rounded-pill bg-green-soft px-2 py-[3px] text-xs font-semibold text-green">
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-[44px] font-bold leading-none tracking-tight text-ink">{value}</div>
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
