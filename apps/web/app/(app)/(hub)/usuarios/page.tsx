import { redirect } from "next/navigation";
import { listAssignableRoles, listModules, listOrgUsers } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AccessManager } from "@/components/access/access-manager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuper) redirect("/inicio");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const [users, roles, modules] = await Promise.all([
    listOrgUsers(db, organizationId),
    listAssignableRoles(db),
    listModules(db),
  ]);

  return (
    <AccessManager
      users={users}
      roles={roles.map((r) => ({ id: r.id, name: r.name, moduleCode: r.module_code }))}
      modules={modules.map((m) => ({ code: m.code, name: m.name }))}
    />
  );
}
