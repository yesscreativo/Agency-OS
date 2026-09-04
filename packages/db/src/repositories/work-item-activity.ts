import type { Json, Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type ActivityRow = Tables<"work_item_activity">;

/** Actor embebido para render. */
export interface ActivityActor {
  id: string;
  full_name: string;
}

export type ActivityWithActor = ActivityRow & { actor: ActivityActor | null };

const ACTIVITY_SELECT =
  "*, actor:users!work_item_activity_actor_user_id_fkey(id, person:people(full_name))";

type ActivitySelectRow = ActivityRow & {
  actor: { id: string; person: { full_name: string } | null } | null;
};

function toActivity(row: ActivitySelectRow): ActivityWithActor {
  return {
    ...row,
    actor: row.actor
      ? { id: row.actor.id, full_name: row.actor.person?.full_name ?? "—" }
      : null,
  };
}

/** Eventos del work item, del más reciente al más antiguo. */
export async function listActivity(db: Db, workItemId: string): Promise<ActivityWithActor[]> {
  const { data, error } = await db
    .from("work_item_activity")
    .select(ACTIVITY_SELECT)
    .eq("work_item_id", workItemId)
    .order("created_at", { ascending: false })
    .returns<ActivitySelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toActivity);
}

export interface RecordActivityInput {
  orgId: string;
  workItemId: string;
  actorUserId: string | null;
  eventType: string;
  payload?: Json;
}

/** Inserta un evento de actividad. Lo llaman las server actions al mutar el work
 * item o al comentar. La actividad es secundaria: si falla, no debe tumbar la
 * acción principal (el llamador la envuelve en try/catch). */
export async function recordActivity(db: Db, input: RecordActivityInput): Promise<void> {
  const values: TablesInsert<"work_item_activity"> = {
    organization_id: input.orgId,
    work_item_id: input.workItemId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    payload: input.payload ?? {},
  };
  const { error } = await db.from("work_item_activity").insert(values);
  if (error) throw error;
}
