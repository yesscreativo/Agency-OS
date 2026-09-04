import { redirect } from "next/navigation";
import { listAreasManagedBy } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { HubNav, type HubNavItem } from "@/components/hub-nav";
import { AreaIcon, HomeIcon, ProfileIcon, UsersIcon } from "@/components/hub-icons";

// Hub de sistema: Inicio (landing de módulos), Mi área (gerentes de área),
// Usuarios (solo Administrador de sistema) y Mi perfil. Sidebar propio,
// distinto de la barra de cada módulo.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const managedAreas = user.isSuper ? [] : await listAreasManagedBy(db, user.id);
  const canSeeMiArea = user.isSuper || managedAreas.length > 0;

  const items: HubNavItem[] = [
    { href: "/inicio", label: "Inicio", icon: <HomeIcon /> },
    ...(canSeeMiArea ? [{ href: "/mi-area", label: "Mi área", icon: <AreaIcon /> }] : []),
    ...(user.isSuper
      ? [{ href: "/usuarios", label: "Usuarios", icon: <UsersIcon /> }]
      : []),
    { href: "/perfil", label: "Mi perfil", icon: <ProfileIcon /> },
  ];

  return (
    <div className="flex flex-col gap-8 sm:flex-row">
      <HubNav items={items} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
