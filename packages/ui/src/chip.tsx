import type { ButtonHTMLAttributes } from "react";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/** Chip filtrable (segmentar leads, filtros de listas). */
export function Chip({ active = false, className = "", ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded-pill px-4 py-2 font-sans text-[13px] transition ${
        active
          ? "border border-transparent bg-green font-semibold text-green-ink"
          : "border border-line-strong bg-transparent text-ink hover:border-green"
      } ${className}`}
      {...props}
    />
  );
}
