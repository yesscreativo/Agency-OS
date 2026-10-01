import { NextResponse } from "next/server";
import { listDecidedByManager, listHolidays } from "@agency-os/db";
import { countBusinessDays, LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveRequestType } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildCsv } from "@/lib/csv";

/** CSV del historial de decisiones del jefe (no requiere `leave.approve_hr` —
 * es su propio historial de aprobación, scopeado por `manager_user_id` tanto
 * acá como en la RLS de `leave_requests`). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
  const type = (searchParams.get("type") || undefined) as LeaveRequestType | undefined;

  const db = await getSupabaseServerClient();
  const [rows, holidays] = await Promise.all([
    listDecidedByManager(db, user.id, { year, month, type }),
    listHolidays(db),
  ]);
  const holidayIsos = holidays.map((h) => h.date);

  const header = ["Colaborador", "Tipo", "Inicio", "Fin", "Días hábiles", "Decidido el", "Estado"];
  const csv = buildCsv(
    header,
    rows.map((r) => [
      r.requester?.full_name ?? "—",
      LEAVE_REQUEST_TYPE_LABELS[r.type],
      r.start_date,
      r.end_date,
      String(countBusinessDays(r.start_date, r.end_date, holidayIsos)),
      r.manager_decided_at ? r.manager_decided_at.slice(0, 10) : "—",
      leaveRequestStatusLabel(r.manager_status, r.hr_status),
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="historial-aprobaciones${year ? `-${year}` : ""}.csv"`,
    },
  });
}
