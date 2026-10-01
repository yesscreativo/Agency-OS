import { redirect } from "next/navigation";
import { listForReport, listHolidays } from "@agency-os/db";
import { countBusinessDays, LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveRequestType } from "@agency-os/domain";
import { AttachmentLink } from "@agency-os/ui";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { filenameFromAttachmentPath, signLeaveAttachments } from "@/lib/leave-attachments";
import { NoAccessPanel } from "@/components/no-access-panel";
import { ReportFilters } from "@/components/rrhh/report-filters";

export const dynamic = "force-dynamic";

function AttachmentCell({ path, url }: { path: string | null; url: string | undefined }) {
  if (!path) return <span className="text-faint">—</span>;
  if (!url) return <span className="text-faint">Adjunto</span>;
  return (
    <AttachmentLink url={url} filename={filenameFromAttachmentPath(path)} className="text-green underline">
      Ver adjunto
    </AttachmentLink>
  );
}

export default async function LeaveReportsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; type?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "leave.approve_hr")) {
    return <NoAccessPanel title="No tienes acceso a Reportes" message="Esta sección es solo para el rol RRHH." />;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) redirect("/inicio");

  const currentYear = new Date().getFullYear();
  const year = Number(searchParams.year) || currentYear;
  const month = searchParams.month ? Number(searchParams.month) : undefined;
  const type = (searchParams.type || undefined) as LeaveRequestType | undefined;

  const db = await getSupabaseServerClient();
  const [rows, holidays] = await Promise.all([
    listForReport(db, organizationId, { year, month, type }),
    listHolidays(db),
  ]);
  const holidayIsos = holidays.map((h) => h.date);
  const attachmentUrls = await signLeaveAttachments(db, rows.map((r) => r.attachment_path));

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Reportes</h1>
      <ReportFilters currentYear={currentYear} />

      <div className="overflow-x-auto rounded-lg border border-line bg-glass backdrop-blur-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Colaborador</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Inicio</th>
              <th className="px-4 py-2">Fin</th>
              <th className="px-4 py-2">Días hábiles</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Adjunto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{r.requester?.full_name ?? "—"}</td>
                <td className="px-4 py-2">{LEAVE_REQUEST_TYPE_LABELS[r.type]}</td>
                <td className="px-4 py-2">{r.start_date}</td>
                <td className="px-4 py-2">{r.end_date}</td>
                <td className="px-4 py-2">{countBusinessDays(r.start_date, r.end_date, holidayIsos)}</td>
                <td className="px-4 py-2">{leaveRequestStatusLabel(r.manager_status, r.hr_status)}</td>
                <td className="px-4 py-2">
                  <AttachmentCell path={r.attachment_path} url={attachmentUrls.get(r.attachment_path ?? "")} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-faint">
                  Sin solicitudes en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
