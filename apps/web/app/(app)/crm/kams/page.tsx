import { redirect } from "next/navigation";
import { listKams } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { KamManager } from "@/components/crm/kam-manager";

export const dynamic = "force-dynamic";

export default async function CrmKamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "kam.manage")) redirect("/crm");

  const db = await getSupabaseServerClient();
  const kams = await listKams(db);

  return (
    <KamManager
      kams={kams.map((k) => ({
        id: k.id,
        name: k.name,
        isActive: k.is_active,
        createdAt: k.created_at,
      }))}
    />
  );
}
