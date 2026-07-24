"use client";

import { usePathname } from "next/navigation";
import { SegmentedTabs } from "@agency-os/ui";

/** Navegación principal del shell como tabs segmentadas del design system.
 * La ruta activa es la del item cuyo href hace el prefijo más largo. */
export function MainNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  const activeKey =
    items
      .map((i) => i.href)
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? items[0]?.href ?? "";

  return (
    <SegmentedTabs
      items={items.map((i) => ({ key: i.href, label: i.label, href: i.href }))}
      activeKey={activeKey}
    />
  );
}
