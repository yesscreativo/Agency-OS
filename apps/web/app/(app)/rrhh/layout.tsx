import { redirect } from "next/navigation";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { MainNav } from "@/components/main-nav";

const RRHH_NAV_ITEMS: { href: string; label: string; permission?: string }[] = [
  { href: "/rrhh", label: "Mis solicitudes" },
  { href: "/rrhh/aprobaciones", label: "Aprobaciones" },
  { href: "/rrhh/reportes", label: "Reportes", permission: "leave.approve_hr" },
  { href: "/rrhh/festivos", label: "Festivos", permission: "leave.approve_hr" },
];

export default async function RrhhLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "rrhh")) redirect("/inicio");

  const visibleItems = RRHH_NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div>
      <MainNav items={visibleItems} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
