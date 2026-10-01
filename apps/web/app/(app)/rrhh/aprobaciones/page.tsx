import { redirect } from "next/navigation";
import {
  listAreasManagedBy,
  listDecidedByManager,
  listHolidays,
  listPendingForHr,
  listPendingForManager,
} from "@agency-os/db";
import {
  countBusinessDays,
  LEAVE_REQUEST_TYPE_LABELS,
  leaveRequestStatusLabel,
  type LeaveRequestType,
} from "@agency-os/domain";
import { AttachmentLink, SegmentedTabs } from "@agency-os/ui";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { decideHrAction, decideManagerAction } from "@/lib/leave-actions";
import { filenameFromAttachmentPath, signLeaveAttachments } from "@/lib/leave-attachments";
import { ApprovalQueue, type PendingRequestRow } from "@/components/rrhh/approval-queue";
import { ReportFilters } from "@/components/rrhh/report-filters";

export const dynamic = "force-dynamic";

function toRow(
  r: {
    id: string;
    type: PendingRequestRow["type"];
    start_date: string;
    end_date: string;
    notes: string | null;
    attachment_path: string | null;
    requester: { full_name: string } | null;
  },
  attachmentUrls: Map<string, string>,
): PendingRequestRow {
  const attachmentUrl = r.attachment_path ? (attachmentUrls.get(r.attachment_path) ?? null) : null;
  return {
    id: r.id,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    requesterName: r.requester?.full_name ?? "—",
    notes: r.notes,
    attachmentUrl,
    attachmentFilename: r.attachment_path ? filenameFromAttachmentPath(r.attachment_path) : null,
  };
}

function AttachmentCell({ path, url }: { path: string | null; url: string | undefined }) {
  if (!path) return <span className="text-faint">—</span>;
  if (!url) return <span className="text-faint">Adjunto</span>;
  return (
    <AttachmentLink url={url} filename={filenameFromAttachmentPath(path)} className="text-green underline">
      Ver adjunto
    </AttachmentLink>
  );
}

export default async function LeaveApprovalsPage({
  searchParams,
}: {
  searchParams: { view?: string; year?: string; month?: string; type?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const organizationId = user.organizationIds[0];

  const db = await getSupabaseServerClient();
  const isHr = hasPermission(user, "leave.approve_hr");
  const isManager = (await listAreasManagedBy(db, user.id)).length > 0;

  if (searchParams.view === "historial" && isManager) {
    const currentYear = new Date().getFullYear();
    const year = Number(searchParams.year) || currentYear;
    const month = searchParams.month ? Number(searchParams.month) : undefined;
    const type = (searchParams.type || undefined) as LeaveRequestType | undefined;

    const [rows, holidays] = await Promise.all([
      listDecidedByManager(db, user.id, { year, month, type }),
      listHolidays(db),
    ]);
    const holidayIsos = holidays.map((h) => h.date);
    const attachmentUrls = await signLeaveAttachments(db, rows.map((r) => r.attachment_path));

    return (
      <div>
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Aprobaciones</h1>
        <SegmentedTabs
          className="mb-6"
          activeKey="historial"
          items={[
            { key: "pendientes", label: "Pendientes", href: "/rrhh/aprobaciones" },
            { key: "historial", label: "Historial", href: "/rrhh/aprobaciones?view=historial" },
          ]}
        />
        <ReportFilters
          currentYear={currentYear}
          basePath="/rrhh/aprobaciones"
          exportPath="/rrhh/aprobaciones/historial/export"
        />
        <div className="overflow-x-auto rounded-lg border border-line bg-glass backdrop-blur-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2">Colaborador</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Inicio</th>
                <th className="px-4 py-2">Fin</th>
                <th className="px-4 py-2">Días hábiles</th>
                <th className="px-4 py-2">Decidido el</th>
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
                  <td className="px-4 py-2">{r.manager_decided_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-2">{leaveRequestStatusLabel(r.manager_status, r.hr_status)}</td>
                  <td className="px-4 py-2">
                    <AttachmentCell path={r.attachment_path} url={attachmentUrls.get(r.attachment_path ?? "")} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-faint">
                    Sin decisiones en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const [managerRows, hrRows] = await Promise.all([
    listPendingForManager(db, user.id),
    isHr && organizationId ? listPendingForHr(db, organizationId) : Promise.resolve([]),
  ]);

  const attachmentUrls = await signLeaveAttachments(db, [...managerRows, ...hrRows].map((r) => r.attachment_path));

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Aprobaciones</h1>
      {isManager && (
        <SegmentedTabs
          className="mb-6"
          activeKey="pendientes"
          items={[
            { key: "pendientes", label: "Pendientes", href: "/rrhh/aprobaciones" },
            { key: "historial", label: "Historial", href: "/rrhh/aprobaciones?view=historial" },
          ]}
        />
      )}
      <ApprovalQueue
        asManager={managerRows.map((r) => toRow(r, attachmentUrls))}
        asHr={hrRows.map((r) => toRow(r, attachmentUrls))}
        onDecideManager={decideManagerAction}
        onDecideHr={decideHrAction}
      />
    </div>
  );
}
