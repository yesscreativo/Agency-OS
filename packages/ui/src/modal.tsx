"use client";

import type { ReactNode } from "react";

/** Ancho máximo del diálogo. `sm` (380px) es el valor histórico y sigue siendo
 * el default para no afectar a los modales existentes. */
export type ModalSize = "sm" | "md" | "lg";

const SIZE_MAX_WIDTH: Record<ModalSize, string> = {
  sm: "max-w-[380px]",
  md: "max-w-[520px]",
  lg: "max-w-[680px]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Acciones del pie (botones). */
  footer?: ReactNode;
  /** Ancho máximo. Default `sm` (380px). */
  size?: ModalSize;
}

export function Modal({ open, onClose, title, description, children, footer, size = "sm" }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-line bg-glass-strong shadow-overlay backdrop-blur-xl ${SIZE_MAX_WIDTH[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <div className="text-lg font-bold tracking-tight text-ink">{title}</div>
            {description && <div className="mt-1 text-[13px] text-muted">{description}</div>}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="cursor-pointer text-lg leading-none text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children && <div className="overflow-y-auto px-6 pt-4">{children}</div>}
        {footer && <div className="flex gap-2.5 p-6 pt-6 [&>*]:flex-1">{footer}</div>}
      </div>
    </div>
  );
}
