import { redirect } from "next/navigation";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { MainNav } from "@/components/main-nav";

const CRM_NAV_ITEMS: { href: string; label: string; permission?: string }[] = [
  { href: "/crm", label: "Cotizaciones" },
  { href: "/crm/kanban", label: "Kanban" },
  { href: "/crm/dashboard", label: "Dashboard" },
  { href: "/crm/clientes", label: "Clientes" },
  { href: "/crm/kams", label: "KAMs / PMs", permission: "kam.manage" },
  { href: "/crm/estados", label: "Estados", permission: "quote_status.manage" },
];

// Navegación propia del módulo CRM: cada módulo arma la suya, distinta de la
// del hub (/inicio, /usuarios, /perfil).
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "crm")) redirect("/inicio");

  const visibleItems = CRM_NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div>
      <MainNav items={visibleItems} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
