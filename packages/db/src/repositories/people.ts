import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type PersonRow = Tables<"people">;

export async function getPerson(db: Db, id: string): Promise<PersonRow | null> {
  const { data, error } = await db.from("people").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Actualiza el nombre de la propia persona ("Mi perfil"); permitido por la
 * policy people_self_update sin necesitar el permiso people.manage. */
export async function updatePersonName(db: Db, id: string, fullName: string): Promise<PersonRow> {
  const { data, error } = await db
    .from("people")
    .update({ full_name: fullName })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Guarda (o limpia con null) la RUTA del avatar del propio usuario en el bucket
 * público user-avatars. Misma policy people_self_update. */
export async function updatePersonAvatar(
  db: Db,
  id: string,
  avatarPath: string | null,
): Promise<PersonRow> {
  const { data, error } = await db
    .from("people")
    .update({ avatar_url: avatarPath })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Asigna el cargo de una persona DENTRO de su área. Vía RPC security definer
 * (035) — no un UPDATE directo: RLS no puede restringir por columna, así que
 * la validación (gerente del área o super admin, y que el cargo pertenezca a
 * esa misma área) vive en la función `set_person_job_title`. */
export async function assignPersonJobTitle(
  db: Db,
  personId: string,
  jobTitleId: string | null,
): Promise<void> {
  // El tipo generado marca p_job_title_id como `string` (no nullable): el
  // generador de tipos no ve que el parámetro Postgres acepta NULL (no hay
  // metadata de nulabilidad para argumentos de función, a diferencia de
  // columnas). La función sí acepta null (limpia el cargo).
  const { error } = await db.rpc("set_person_job_title", {
    p_person_id: personId,
    p_job_title_id: jobTitleId,
  } as { p_person_id: string; p_job_title_id: string });
  if (error) throw error;
}
