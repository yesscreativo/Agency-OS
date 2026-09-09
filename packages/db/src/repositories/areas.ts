import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type AreaRow = Tables<"areas">;

type AreaSelectRow = AreaRow & {
  manager: { id: string; person: { full_name: string } | null } | null;
};

const AREA_SELECT = "*, manager:users!areas_manager_user_id_fkey(id, person:people(full_name))";

export async function listAreas(
  db: Db,
  orgId: string,
): Promise<(AreaRow & { managerName: string | null })[]> {
  const { data, error } = await db
    .from("areas")
    .select(AREA_SELECT)
    .eq("organization_id", orgId)
    .order("name")
    .returns<AreaSelectRow[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    managerName: row.manager?.person?.full_name ?? null,
  }));
}

export async function createArea(
  db: Db,
  values: { organizationId: string; name: string; managerUserId: string },
): Promise<AreaRow> {
  const insert: TablesInsert<"areas"> = {
    organization_id: values.organizationId,
    name: values.name,
    manager_user_id: values.managerUserId,
  };
  const { data, error } = await db.from("areas").insert(insert).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAreaManager(db: Db, id: string, managerUserId: string): Promise<void> {
  const { error } = await db
    .from("areas")
    .update({ manager_user_id: managerUserId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Umbral de "carga alta" (tareas abiertas) que dispara la alerta en /mi-area
 * y en el dashboard de Proyectos. Se llama con service role desde la action
 * (`areas_write` en RLS exige super admin; el gerente del área se valida en
 * la action con `requireAreaManager` antes de llegar acá). */
export async function updateAreaOverloadThreshold(db: Db, id: string, threshold: number): Promise<void> {
  const { error } = await db
    .from("areas")
    .update({ overload_threshold: threshold, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listAreasManagedBy(db: Db, userId: string): Promise<AreaRow[]> {
  const { data, error } = await db.from("areas").select("*").eq("manager_user_id", userId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getArea(db: Db, id: string): Promise<AreaRow | null> {
  const { data, error } = await db.from("areas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export interface AreaPerson {
  /** id de `people` (para asignar cargo, `set_person_job_title`). */
  id: string;
  /** id de `users` (para tareas/tiempo, que se filtran por user_id) — null si
   * la persona todavía no tiene cuenta de acceso ("Pendiente"). */
  userId: string | null;
  fullName: string;
  avatarUrl: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
}

type AreaPersonRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  job_title_id: string | null;
  job_title: { id: string; name: string } | null;
};

/** `people.id` no es `users.id` — se resuelven por separado (sin `users.person_id`
 * único, un embed people→users sería ambiguo de cardinalidad en PostgREST) para
 * no arriesgar una asunción de forma equivocada. */
export async function listPeopleInArea(db: Db, areaId: string): Promise<AreaPerson[]> {
  const { data, error } = await db
    .from("people")
    .select("id, full_name, avatar_url, job_title_id, job_title:job_titles(id, name)")
    .eq("area_id", areaId)
    .is("deleted_at", null)
    .order("full_name")
    .returns<AreaPersonRow[]>();
  if (error) throw error;
  const rows = data ?? [];

  const peopleIds = rows.map((r) => r.id);
  const userIdByPerson = new Map<string, string>();
  if (peopleIds.length > 0) {
    const { data: userRows, error: userError } = await db
      .from("users")
      .select("id, person_id")
      .in("person_id", peopleIds);
    if (userError) throw userError;
    for (const u of userRows ?? []) userIdByPerson.set(u.person_id, u.id);
  }

  return rows.map((r) => ({
    id: r.id,
    userId: userIdByPerson.get(r.id) ?? null,
    fullName: r.full_name,
    avatarUrl: r.avatar_url
      ? (db.storage.from("user-avatars").getPublicUrl(r.avatar_url).data.publicUrl ?? null)
      : null,
    jobTitleId: r.job_title_id,
    jobTitleName: r.job_title?.name ?? null,
  }));
}
