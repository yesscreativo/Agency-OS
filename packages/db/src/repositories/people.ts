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
