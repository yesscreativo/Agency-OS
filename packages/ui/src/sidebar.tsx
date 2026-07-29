import type { HTMLAttributes, ReactNode } from "react";

/** Contenedor de menú lateral (ej. hub de Inicio/Usuarios/Mi perfil). */
export function Sidebar({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <nav
      className={`w-full shrink-0 space-y-1 sm:w-[220px] ${className}`}
      {...props}
    />
  );
}

export interface SidebarItemProps {
  href: string;
  label: ReactNode;
  icon?: ReactNode;
  active?: boolean;
}

export function SidebarItem({ href, label, icon, active = false }: SidebarItemProps) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm transition ${
        active
          ? "bg-green font-semibold text-green-ink"
          : "text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
    </a>
  );
}
