import { redirect } from "next/navigation";
import { listQuoteStatuses } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { QuoteStatusManager } from "@/components/crm/quote-status-manager";

export const dynamic = "force-dynamic";

export default async function CrmEstadosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote_status.manage")) redirect("/crm");

  const db = await getSupabaseServerClient();
  const statuses = await listQuoteStatuses(db);

  return (
    <QuoteStatusManager
      statuses={statuses.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.label,
        color: s.color,
        isSolid: s.is_solid,
        onColor: s.on_color,
        isActive: s.is_active,
        isSystem: s.is_system,
      }))}
    />
  );
}
