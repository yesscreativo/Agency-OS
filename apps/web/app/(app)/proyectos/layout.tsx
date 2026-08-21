import { redirect } from "next/navigation";
import { listClientSpaces } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectsSidebar } from "@/components/proyectos/projects-sidebar";
import { NoAccessPanel } from "@/components/no-access-panel";

// Layout del módulo Proyectos con navegación tipo "Spaces": sidebar de clientes a
// la izquierda (patrón flex-row del hub). Cada cliente es un espacio con sus
// proyectos. Ver projects-sidebar.tsx.
export default async function ProyectosLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Sin acceso al módulo o sin permiso de lectura: mostramos un mensaje claro en
  // vez de rebotar a /inicio en silencio (p. ej. al abrir el enlace de una
  // notificación de mención). Cubre TODA la ruta /proyectos/* al vivir aquí.
  if (!canAccessModule(user, "proyectos") || !hasPermission(user, "project.view")) {
    return (
      <div className="mx-auto max-w-[560px]">
        <NoAccessPanel
          title="No tienes acceso a Proyectos"
          message="Tu rol no tiene permiso para ver este módulo. Si crees que deberías tener acceso, pídele a un administrador que te lo habilite."
        />
      </div>
    );
  }

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
