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

export async function reportEntries(
  db: Db,
  opts: { organizationId: string; userId?: string; projectId?: string; from?: string; to?: string },
): Promise<TimeEntryWithUser[]> {
  let q = db
    .from("work_item_time_entries")
    .select(SELECT_WITH_USER)
    .eq("organization_id", opts.organizationId);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.from) q = q.gte("spent_on", opts.from);
  if (opts.to) q = q.lte("spent_on", opts.to);
  const { data, error } = await q.order("spent_on", { ascending: false }).returns<SelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toEntry);
}
