import { redirect } from "next/navigation";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { MainNav } from "@/components/main-nav";

const PROJECTS_NAV_ITEMS: { href: string; label: string; permission?: string }[] = [
  { href: "/proyectos", label: "Proyectos", permission: "project.view" },
];

// Navegación propia del módulo Proyectos: cada módulo arma la suya, distinta de
// la del hub (/inicio, /usuarios, /perfil). Ver crm/layout.tsx para el mismo patrón.
export default async function ProyectosLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "proyectos")) redirect("/inicio");

  const visibleItems = PROJECTS_NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div>
      <MainNav items={visibleItems} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
