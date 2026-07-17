import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type RoleRow = Tables<"roles">;

/** Roles asignables desde la sección general de Usuarios: los de sistema
 * (is_super, ej. Administrador) y los de cada módulo. Excluye los roles-persona
 * legacy (ni super ni de módulo) que no dan acceso a nada hoy. */
export async function listAssignableRoles(db: Db): Promise<RoleRow[]> {
  const { data, error } = await db
    .from("roles")
    .select("*")
    .or("is_super.eq.true,module_code.not.is.null")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
