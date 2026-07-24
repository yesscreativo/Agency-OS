"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarItem } from "@agency-os/ui";

export interface HubNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

/** Sidebar del hub (Inicio/Usuarios/Mi perfil). La ruta activa es la del
 * item cuyo href hace el prefijo más largo — mismo criterio que MainNav. */
export function HubNav({ items }: { items: HubNavItem[] }) {
  const pathname = usePathname();

  const activeHref =
    items
      .map((i) => i.href)
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? items[0]?.href ?? "";

  return (
    <Sidebar>
      {items.map((item) => (
        <SidebarItem
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={item.href === activeHref}
        />
      ))}
    </Sidebar>
  );
}
