import { redirect } from "next/navigation";
import { listMyLeaveRequests } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { MyRequestsList, type MyRequestRow } from "@/components/rrhh/my-requests-list";

export const dynamic = "force-dynamic";

export default async function MyLeaveRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const rows = await listMyLeaveRequests(db, user.id);

  const requests: MyRequestRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    managerStatus: r.manager_status,
    hrStatus: r.hr_status,
    managerRejectReason: r.manager_reject_reason,
    hrRejectReason: r.hr_reject_reason,
  }));

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Mis solicitudes</h1>
      <MyRequestsList requests={requests} />
    </div>
  );
}
