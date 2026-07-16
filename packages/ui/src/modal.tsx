"use client";

import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Acciones del pie (botones). */
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
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
        className="w-full max-w-[380px] rounded-lg border border-line bg-elev p-6 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
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
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex gap-2.5 [&>*]:flex-1">{footer}</div>}
      </div>
    </div>
  );
}
