import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HubNav, type HubNavItem } from "@/components/hub-nav";
import { HomeIcon, ProfileIcon, UsersIcon } from "@/components/hub-icons";

// Hub de sistema: Inicio (landing de módulos), Usuarios (solo Administrador de
// sistema) y Mi perfil. Sidebar propio, distinto de la barra de cada módulo.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items: HubNavItem[] = [
    { href: "/inicio", label: "Inicio", icon: <HomeIcon /> },
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
