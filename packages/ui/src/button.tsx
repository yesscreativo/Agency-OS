import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-green text-green-ink border-transparent hover:brightness-105",
  secondary: "bg-purple-strong text-white border-transparent hover:brightness-110",
  outline: "bg-transparent text-ink border-line-strong hover:border-green",
  ghost: "bg-transparent text-ink border-transparent hover:bg-surface-2",
  danger:
    "text-danger [background:color-mix(in_srgb,var(--danger)_14%,transparent)] [border-color:color-mix(in_srgb,var(--danger)_45%,transparent)] hover:[background:color-mix(in_srgb,var(--danger)_22%,transparent)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-4 py-[7px] text-xs",
  md: "px-[22px] py-[11px] text-sm",
  lg: "px-[30px] py-[15px] text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill border font-sans font-semibold transition disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-faint disabled:brightness-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
