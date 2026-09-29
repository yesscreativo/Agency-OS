import { redirect } from "next/navigation";
import {
  listAreas,
  listAllRoles,
  listAssignableRoles,
  listModules,
  listOrgUsers,
  listPermissions,
  listRolePermissionPairs,
} from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AccessManager } from "@/components/access/access-manager";
import { AreasManager } from "@/components/access/areas-manager";
import { RolesManager } from "@/components/access/roles-manager";
import { UsuariosTabs } from "@/components/access/usuarios-tabs";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuper) redirect("/inicio");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const [orgUsers, assignableRoles, modules, areas, allRoles, permissions, rolePermissionPairs] =
    await Promise.all([
      listOrgUsers(db, organizationId),
      listAssignableRoles(db),
      listModules(db),
      listAreas(db, organizationId),
      listAllRoles(db),
      listPermissions(db),
      listRolePermissionPairs(db),
    ]);

  const rolePermissionsByRole: Record<string, string[]> = {};
  for (const pair of rolePermissionPairs) {
    const list = rolePermissionsByRole[pair.role_id];
    if (list) list.push(pair.permission_id);
    else rolePermissionsByRole[pair.role_id] = [pair.permission_id];
  }

  return (
    <UsuariosTabs
      usersContent={
        <>
          <AccessManager
            users={orgUsers}
            roles={assignableRoles.map((r) => ({ id: r.id, name: r.name, moduleCode: r.module_code }))}
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
            users={orgUsers.map((u) => ({ id: u.id, fullName: u.fullName }))}
          />
        </>
      }
      rolesContent={
        <RolesManager
          roles={allRoles.map((r) => ({
            id: r.id,
            name: r.name,
            moduleCode: r.module_code,
            isSuper: r.is_super,
          }))}
          permissions={permissions.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description,
          }))}
          rolePermissionsByRole={rolePermissionsByRole}
          modules={modules.map((m) => ({ code: m.code, name: m.name }))}
        />
      }
    />
  );
}
