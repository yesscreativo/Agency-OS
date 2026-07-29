import { redirect } from "next/navigation";
import { listKams, listOrgUsers } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { KamManager } from "@/components/crm/kam-manager";

export const dynamic = "force-dynamic";

export default async function CrmKamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "kam.manage")) redirect("/crm");

  const db = await getSupabaseServerClient();
  const orgId = user.organizationIds[0];
  const [kams, users] = await Promise.all([
    listKams(db),
    orgId ? listOrgUsers(db, orgId) : Promise.resolve([]),
  ]);

  return (
    <KamManager
      kams={kams.map((k) => ({
        id: k.id,
        name: k.name,
        isActive: k.is_active,
        createdAt: k.created_at,
        userId: k.user_id,
      }))}
      users={users.map((u) => ({ id: u.id, name: u.fullName }))}
    />
  );
}
