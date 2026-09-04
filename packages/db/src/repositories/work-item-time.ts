import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type TimeEntryRow = Tables<"work_item_time_entries">;
export type TimeEntryWithUser = TimeEntryRow & {
  user: { id: string; full_name: string; avatar_url: string | null } | null;
};

const SELECT_WITH_USER =
  "*, user:users!work_item_time_entries_user_id_fkey(id, person:people(full_name, avatar_url))";

type SelectRow = TimeEntryRow & {
  user: { id: string; person: { full_name: string; avatar_url: string | null } | null } | null;
};

function toEntry(row: SelectRow): TimeEntryWithUser {
  return {
    ...row,
    user: row.user
      ? {
          id: row.user.id,
          full_name: row.user.person?.full_name ?? "—",
          avatar_url: row.user.person?.avatar_url ?? null,
        }
      : null,
  };
}

export async function insertTimeEntry(
  db: Db,
  values: TablesInsert<"work_item_time_entries">,
): Promise<TimeEntryRow> {
  const { data, error } = await db.from("work_item_time_entries").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

export async function getTimeEntry(db: Db, id: string): Promise<TimeEntryRow | null> {
  const { data, error } = await db.from("work_item_time_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTimeEntry(
  db: Db,
  id: string,
  patch: { minutes?: number; spent_on?: string; note?: string | null },
): Promise<void> {
  const { error } = await db
    .from("work_item_time_entries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTimeEntry(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_time_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function listTimeEntries(db: Db, workItemId: string): Promise<TimeEntryWithUser[]> {
  const { data, error } = await db
    .from("work_item_time_entries")
    .select(SELECT_WITH_USER)
    .eq("work_item_id", workItemId)
    .order("spent_on", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<SelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

const SELECT_WITH_USER_AND_TASK =
  "*, user:users!work_item_time_entries_user_id_fkey(id, person:people(full_name, avatar_url)), task:work_items!work_item_time_entries_work_item_id_fkey(id, title), project:work_items!work_item_time_entries_project_id_fkey(id, title, client:clients(id, name))";

type ReportSelectRow = SelectRow & {
  task: { id: string; title: string } | null;
  project: { id: string; title: string; client: { id: string; name: string } | null } | null;
};

export type TimeEntryForReport = TimeEntryWithUser & {
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
};

function toReportEntry(row: ReportSelectRow): TimeEntryForReport {
  return {
    ...toEntry(row),
    taskTitle: row.task?.title ?? "—",
    projectId: row.project?.id ?? row.project_id,
    projectTitle: row.project?.title ?? "—",
    clientId: row.project?.client?.id ?? "sin-cliente",
    clientName: row.project?.client?.name ?? "Sin cliente",
  };
}

export async function reportEntries(
  db: Db,
  opts: { organizationId: string; userId?: string; projectId?: string; from?: string; to?: string },
): Promise<TimeEntryForReport[]> {
  let q = db
    .from("work_item_time_entries")
    .select(SELECT_WITH_USER_AND_TASK)
    .eq("organization_id", opts.organizationId);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.from) q = q.gte("spent_on", opts.from);
  if (opts.to) q = q.lte("spent_on", opts.to);
  const { data, error } = await q.order("spent_on", { ascending: false }).returns<ReportSelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toReportEntry);
}

export type ActiveTimerRow = Tables<"work_item_active_timers">;

export async function getActiveTimer(db: Db, userId: string): Promise<ActiveTimerRow | null> {
  const { data, error } = await db
    .from("work_item_active_timers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertActiveTimer(
  db: Db,
  values: { user_id: string; organization_id: string; work_item_id: string },
): Promise<ActiveTimerRow> {
  const { data, error } = await db
    .from("work_item_active_timers")
    .upsert({ ...values, started_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteActiveTimer(db: Db, userId: string): Promise<void> {
  const { error } = await db.from("work_item_active_timers").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Minutos registrados por tarea dentro de un proyecto (para la columna de
 * tiempo en la vista Lista). */
export async function sumMinutesByTask(db: Db, projectId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const { data, error } = await db
    .from("work_item_time_entries")
    .select("work_item_id, minutes")
    .eq("project_id", projectId);
  if (error) throw error;
  for (const r of data ?? []) out[r.work_item_id] = (out[r.work_item_id] ?? 0) + r.minutes;
  return out;
}

/** Minutos totales registrados en un proyecto (para la cabecera). */
export async function sumMinutesByProject(db: Db, projectId: string): Promise<number> {
  const { data, error } = await db
    .from("work_item_time_entries")
    .select("minutes")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []).reduce((n, r) => n + r.minutes, 0);
}

/** Minutos por usuario dentro de un rango de fechas — para "Carga del
 * equipo" (tiempo de la semana de cada colaborador). */
export async function sumMinutesByUsersInRange(
  db: Db,
  opts: { organizationId: string; userIds: string[]; from: string; to: string },
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (opts.userIds.length === 0) return out;
  const { data, error } = await db
    .from("work_item_time_entries")
    .select("user_id, minutes")
    .eq("organization_id", opts.organizationId)
    .in("user_id", opts.userIds)
    .gte("spent_on", opts.from)
    .lte("spent_on", opts.to);
  if (error) throw error;
  for (const r of data ?? []) out[r.user_id] = (out[r.user_id] ?? 0) + r.minutes;
  return out;
}
