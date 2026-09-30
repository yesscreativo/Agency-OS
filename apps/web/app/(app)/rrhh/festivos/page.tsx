import { redirect } from "next/navigation";
import { listHolidays } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { HolidaysManager } from "@/components/rrhh/holidays-manager";

export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "leave.approve_hr")) {
    return (
      <NoAccessPanel
        title="No tienes acceso a Festivos"
        message="Esta sección es solo para el rol RRHH."
      />
    );
  }

  const db = await getSupabaseServerClient();
  const rows = await listHolidays(db);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Festivos</h1>
      <HolidaysManager holidays={rows.map((h) => ({ id: h.id, date: h.date, name: h.name }))} />
    </div>
  );
}
