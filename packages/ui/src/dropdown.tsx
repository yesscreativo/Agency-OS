"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface DropdownProps {
  /** Disparador; recibe el estado abierto. */
  trigger: (open: boolean) => ReactNode;
  /** Título de sección opcional ("Acciones"). */
  label?: string;
  children: ReactNode;
  align?: "left" | "right";
}

export function Dropdown({ trigger, label, children, align = "left" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={`absolute z-40 mt-2 w-[230px] rounded-md border border-line bg-elev p-2 shadow-overlay ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {label && (
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
              {label}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export interface DropdownItemProps {
  icon?: ReactNode;
  danger?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}

export function DropdownItem({ icon, danger = false, onSelect, children }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left font-sans text-sm transition hover:bg-surface-2 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {icon && <span className={danger ? "" : "text-muted"}>{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="mx-1 my-1.5 h-px bg-line" />;
}
