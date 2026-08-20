import { redirect } from "next/navigation";
import { listClientSpaces } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectsSidebar } from "@/components/proyectos/projects-sidebar";

// Layout del módulo Proyectos con navegación tipo "Spaces": sidebar de clientes a
// la izquierda (patrón flex-row del hub). Cada cliente es un espacio con sus
// proyectos. Ver projects-sidebar.tsx.
export default async function ProyectosLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "proyectos")) redirect("/inicio");
  if (!hasPermission(user, "project.view")) redirect("/inicio");

  const organizationId = user.organizationIds[0];
  const db = await getSupabaseServerClient();
  const clients = organizationId ? await listClientSpaces(db, organizationId, user.id) : [];

  return (
    <div className="flex flex-col gap-8 sm:flex-row">
      <ProjectsSidebar clients={clients} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
