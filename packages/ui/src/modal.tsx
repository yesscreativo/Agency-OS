"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  // Portal a document.body: si el modal se monta dentro de un ancestro con
  // filter/backdrop-filter (ej. las tarjetas `backdrop-blur-xl` del DS), ese
  // ancestro pasa a ser el containing block de los descendientes `fixed` y el
  // overlay queda atrapado detrás de hermanos posteriores en vez de cubrir
  // toda la pantalla. `mounted` evita el mismatch de SSR (no hay `document`).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  return createPortal(
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
    </div>,
    document.body,
  );
}
