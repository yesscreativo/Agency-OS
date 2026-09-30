import { redirect } from "next/navigation";
import { listPendingForHr, listPendingForManager } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { decideHrAction, decideManagerAction } from "@/lib/leave-actions";
import { ApprovalQueue, type PendingRequestRow } from "@/components/rrhh/approval-queue";

export const dynamic = "force-dynamic";

function toRow(r: {
  id: string;
  type: PendingRequestRow["type"];
  start_date: string;
  end_date: string;
  notes: string | null;
  requester: { full_name: string } | null;
}): PendingRequestRow {
  return {
    id: r.id,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    requesterName: r.requester?.full_name ?? "—",
    notes: r.notes,
  };
}

export default async function LeaveApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const organizationId = user.organizationIds[0];

  const db = await getSupabaseServerClient();
  const isHr = hasPermission(user, "leave.approve_hr");

  const [managerRows, hrRows] = await Promise.all([
    listPendingForManager(db, user.id),
    isHr && organizationId ? listPendingForHr(db, organizationId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Aprobaciones</h1>
      <ApprovalQueue
        asManager={managerRows.map(toRow)}
        asHr={hrRows.map(toRow)}
        onDecideManager={decideManagerAction}
        onDecideHr={decideHrAction}
      />
    </div>
  );
}
