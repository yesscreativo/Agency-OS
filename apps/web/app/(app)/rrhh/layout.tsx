import { redirect } from "next/navigation";
import { listAreasManagedBy } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { MainNav } from "@/components/main-nav";

type NavItem = { href: string; label: string; permission?: string };

const MIS_SOLICITUDES: NavItem = { href: "/rrhh", label: "Mis solicitudes" };
const APROBACIONES: NavItem = { href: "/rrhh/aprobaciones", label: "Aprobaciones" };
const HR_ONLY_ITEMS: NavItem[] = [
  { href: "/rrhh/reportes", label: "Reportes", permission: "leave.approve_hr" },
  { href: "/rrhh/festivos", label: "Festivos", permission: "leave.approve_hr" },
];

export default async function RrhhLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "rrhh")) redirect("/inicio");

  // "Aprobaciones" solo es útil para quien aprueba algo: jefe de algún área
  // o rol RRHH. Para el resto de colaboradores la bandeja siempre está vacía
  // y solo genera confusión (ver QA 2026-10-01).
  const isHr = hasPermission(user, "leave.approve_hr");
  let isManager = false;
  if (!isHr) {
    const db = await getSupabaseServerClient();
    isManager = (await listAreasManagedBy(db, user.id)).length > 0;
  }

  const items: NavItem[] = [
    MIS_SOLICITUDES,
    ...(isHr || isManager ? [APROBACIONES] : []),
    ...HR_ONLY_ITEMS,
  ];

  const visibleItems = items.filter((item) => !item.permission || hasPermission(user, item.permission));

  return (
    <div>
      <MainNav items={visibleItems} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
