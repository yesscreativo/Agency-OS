import { redirect } from "next/navigation";
import { listOrgUsers, listRolesByModule } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { ProyectosAccessManager } from "@/components/proyectos/proyectos-access-manager";

export const dynamic = "force-dynamic";

export default async function ProyectosUsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!hasPermission(user, "project.manage_access")) {
    return (
      <div className="mx-auto max-w-[560px]">
        <NoAccessPanel
          title="No tienes acceso a esta sección"
          message="Gestionar accesos de Proyectos requiere el rol 'Proyectos - Admin' (o ser Administrador de sistema)."
        />
      </div>
    );
  }

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const [orgUsers, projectRoles] = await Promise.all([
    listOrgUsers(db, organizationId),
    listRolesByModule(db, "proyectos"),
  ]);

  const users = orgUsers.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    projectRoles: u.roles
      .filter((r) => r.moduleCode === "proyectos")
      .map((r) => ({ userRoleId: r.userRoleId, roleName: r.roleName })),
  }));

  return (
    <ProyectosAccessManager
      users={users}
      roles={projectRoles.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
