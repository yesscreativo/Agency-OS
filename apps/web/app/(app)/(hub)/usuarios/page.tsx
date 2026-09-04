import { redirect } from "next/navigation";
import { listAreas, listAssignableRoles, listModules, listOrgUsers } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AccessManager } from "@/components/access/access-manager";
import { AreasManager } from "@/components/access/areas-manager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuper) redirect("/inicio");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const [users, roles, modules, areas] = await Promise.all([
    listOrgUsers(db, organizationId),
    listAssignableRoles(db),
    listModules(db),
    listAreas(db, organizationId),
  ]);

  return (
    <>
      <AccessManager
        users={users}
        roles={roles.map((r) => ({ id: r.id, name: r.name, moduleCode: r.module_code }))}
        modules={modules.map((m) => ({ code: m.code, name: m.name }))}
        areas={areas.map((a) => ({ id: a.id, name: a.name }))}
        currentUserId={user.id}
      />
      <AreasManager
        areas={areas.map((a) => ({
          id: a.id,
          name: a.name,
          managerUserId: a.manager_user_id,
          managerName: a.managerName,
        }))}
        users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
      />
    </>
  );
}
