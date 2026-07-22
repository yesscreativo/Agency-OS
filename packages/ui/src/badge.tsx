import type { CSSProperties, HTMLAttributes } from "react";

export type BadgeTone = "success" | "info" | "danger" | "neutral";
export type BadgeVariant = "soft" | "solid";

const TONES: Record<BadgeTone, { pill: string; dot: string }> = {
  success: { pill: "bg-green-soft text-green", dot: "bg-green" },
  info: { pill: "bg-purple-soft text-purple", dot: "bg-purple" },
  danger: {
    pill: "text-danger [background:color-mix(in_srgb,var(--danger)_15%,transparent)]",
    dot: "bg-danger",
  },
  neutral: { pill: "bg-surface-2 text-muted", dot: "bg-faint" },
};

/** Color de texto (#0d0f08 oscuro o #ffffff blanco) con mejor contraste sobre un
 * fondo hex sólido, según luminancia relativa (WCAG). Puro y exportable. */
export function readableTextOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#ffffff";
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(c.slice(0, 2), 16));
  const g = toLin(parseInt(c.slice(2, 4), 16));
  const b = toLin(parseInt(c.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#0d0f08" : "#ffffff";
}

const BASE = "inline-flex items-center gap-1.5 rounded-pill px-3 py-[5px] text-xs font-semibold";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Tono semántico del design system (legacy). Ignorado si se pasa `color`. */
  tone?: BadgeTone;
  /** Color hex del catálogo de estados; si viene, manda sobre `tone`. */
  color?: string;
  /** `soft` = píldora tintada (default); `solid` = fondo lleno (p. ej. "Cerrada"). */
  variant?: BadgeVariant;
  /** Override del color de texto en variante `solid` (si no, se calcula por luminancia). */
  onColor?: string;
  /** Punto de estado a la izquierda (por defecto visible; oculto en `solid`). */
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  color,
  variant = "soft",
  onColor,
  dot = true,
  className = "",
  style,
  children,
  ...props
}: BadgeProps) {
  // Modo data-driven: color hex explícito (Tailwind no genera clases de un hex en
  // runtime, así que se aplica vía `style` con color-mix, igual que el tono danger).
  if (color) {
    const isSolid = variant === "solid";
    const pillStyle: CSSProperties = isSolid
      ? { background: color, color: onColor ?? readableTextOn(color) }
      : {
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color: `color-mix(in srgb, ${color} 82%, var(--text))`,
        };
    return (
      <span className={`${BASE} ${className}`} style={{ ...pillStyle, ...style }} {...props}>
        {dot && !isSolid && (
          <span className="h-1.5 w-1.5 rounded-pill" style={{ background: color }} />
        )}
        {children}
      </span>
    );
  }

  // Modo legacy: tono semántico con clases del design system.
  const t = TONES[tone];
  return (
    <span className={`${BASE} ${t.pill} ${className}`} style={style} {...props}>
      {dot && <span className={`h-1.5 w-1.5 rounded-pill ${t.dot}`} />}
      {children}
    </span>
  );
}
