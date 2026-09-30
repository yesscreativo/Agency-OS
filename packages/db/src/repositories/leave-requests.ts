import type { Enums, Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type LeaveRequestRow = Tables<"leave_requests">;

export interface RequesterInfo {
  id: string;
  full_name: string;
}

export type LeaveRequestWithRequester = LeaveRequestRow & { requester: RequesterInfo | null };

const WITH_REQUESTER_SELECT =
  "*, requester:users!leave_requests_requester_user_id_fkey(id, person:people(full_name))";

type WithRequesterDbRow = LeaveRequestRow & {
  requester: { id: string; person: { full_name: string } | null } | null;
};

function toWithRequester(row: WithRequesterDbRow): LeaveRequestWithRequester {
  return {
    ...row,
    requester: row.requester ? { id: row.requester.id, full_name: row.requester.person?.full_name ?? "—" } : null,
  };
}

export async function createLeaveRequest(
  db: Db,
  values: TablesInsert<"leave_requests">,
): Promise<LeaveRequestRow> {
  const { data, error } = await db.from("leave_requests").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

export async function getLeaveRequest(db: Db, id: string): Promise<LeaveRequestRow | null> {
  const { data, error } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMyLeaveRequests(db: Db, requesterUserId: string): Promise<LeaveRequestRow[]> {
  const { data, error } = await db
    .from("leave_requests")
    .select("*")
    .eq("requester_user_id", requesterUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Pendientes de decisión del jefe (bandeja de aprobación, paso 1). */
export async function listPendingForManager(db: Db, managerUserId: string): Promise<LeaveRequestWithRequester[]> {
  const { data, error } = await db
    .from("leave_requests")
    .select(WITH_REQUESTER_SELECT)
    .eq("manager_user_id", managerUserId)
    .eq("manager_status", "pending")
    .order("created_at", { ascending: true })
    .returns<WithRequesterDbRow[]>();
  if (error) throw error;
  return (data ?? []).map(toWithRequester);
}

/** Pendientes de decisión de RRHH (paso 2, ya aprobadas por el jefe). */
export async function listPendingForHr(db: Db, orgId: string): Promise<LeaveRequestWithRequester[]> {
  const { data, error } = await db
    .from("leave_requests")
    .select(WITH_REQUESTER_SELECT)
    .eq("organization_id", orgId)
    .eq("manager_status", "approved")
    .eq("hr_status", "pending")
    .order("created_at", { ascending: true })
    .returns<WithRequesterDbRow[]>();
  if (error) throw error;
  return (data ?? []).map(toWithRequester);
}

export async function decideManager(
  db: Db,
  id: string,
  decision: { status: Enums<"leave_approval_status">; reason?: string | null },
): Promise<void> {
  const { error } = await db
    .from("leave_requests")
    .update({
      manager_status: decision.status,
      manager_decided_at: new Date().toISOString(),
      manager_reject_reason: decision.reason ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function decideHr(
  db: Db,
  id: string,
  decision: { status: Enums<"leave_approval_status">; reason?: string | null },
): Promise<void> {
  const { error } = await db
    .from("leave_requests")
    .update({
      hr_status: decision.status,
      hr_decided_at: new Date().toISOString(),
      hr_reject_reason: decision.reason ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export interface LeaveReportFilters {
  year: number;
  month?: number; // 1-12
  personUserId?: string;
  type?: Enums<"leave_request_type">;
}

/** Solicitudes para el reporte/export de RRHH, filtradas por año (obligatorio)
 * y opcionalmente mes/persona/tipo. Filtra por `start_date` dentro del
 * año/mes pedido. */
export async function listForReport(
  db: Db,
  orgId: string,
  filters: LeaveReportFilters,
): Promise<LeaveRequestWithRequester[]> {
  const monthStr = filters.month ? String(filters.month).padStart(2, "0") : null;
  const rangeStart = monthStr ? `${filters.year}-${monthStr}-01` : `${filters.year}-01-01`;
  const rangeEnd = monthStr ? `${filters.year}-${monthStr}-31` : `${filters.year}-12-31`;

  let query = db
    .from("leave_requests")
    .select(WITH_REQUESTER_SELECT)
    .eq("organization_id", orgId)
    .gte("start_date", rangeStart)
    .lte("start_date", rangeEnd)
    .order("start_date");

  if (filters.personUserId) query = query.eq("requester_user_id", filters.personUserId);
  if (filters.type) query = query.eq("type", filters.type);

  const { data, error } = await query.returns<WithRequesterDbRow[]>();
  if (error) throw error;
  return (data ?? []).map(toWithRequester);
}
