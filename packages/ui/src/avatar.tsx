import type { HTMLAttributes, ReactNode } from "react";

export type AvatarTone = "green" | "purple" | "purple-strong" | "neutral";
export type AvatarSize = "xs" | "sm" | "md" | "lg";

const TONES: Record<AvatarTone, string> = {
  green: "bg-green text-green-ink",
  purple: "bg-purple text-white",
  "purple-strong": "bg-purple-strong text-white",
  neutral: "bg-surface-2 text-muted border border-line",
};

const SIZES: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[11px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[13px]",
  lg: "h-12 w-12 text-base",
};

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Iniciales, p. ej. "DR". */
  initials: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  /** Muestra el punto verde de "en línea". */
  online?: boolean;
}

export function Avatar({
  initials,
  tone = "purple",
  size = "md",
  online = false,
  className = "",
  ...props
}: AvatarProps) {
  return (
    <div className={`relative inline-flex ${className}`} {...props}>
      <div
        className={`flex items-center justify-center rounded-pill font-semibold ${TONES[tone]} ${SIZES[size]}`}
      >
        {initials}
      </div>
      {online && (
        <span className="absolute -bottom-px right-0 h-3 w-3 rounded-pill border-2 border-bg bg-green" />
      )}
    </div>
  );
}

/** Grupo con solape; pasa Avatares como hijos y opcionalmente un contador de resto. */
export function AvatarGroup({ children, more }: { children: ReactNode; more?: number }) {
  return (
    <div className="flex items-center [&>*]:border-2 [&>*]:border-bg [&>*:not(:first-child)]:-ml-3 [&>*]:rounded-pill">
      {children}
      {more != null && more > 0 && (
        <div className="flex h-9 w-9 items-center justify-center rounded-pill border-2 border-bg bg-surface-2 text-xs font-bold text-muted">
          +{more}
        </div>
      )}
    </div>
  );
}
