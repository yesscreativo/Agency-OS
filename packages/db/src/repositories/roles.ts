import { slugify } from "@agency-os/domain";
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

/** Roles delegables de un módulo específico (ej. 'proyectos'), para la página de
 * gestión de accesos propia del módulo. Nunca incluye roles is_super. */
export async function listRolesByModule(db: Db, moduleCode: string): Promise<RoleRow[]> {
  const { data, error } = await db
    .from("roles")
    .select("*")
    .eq("module_code", moduleCode)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** TODOS los roles, sin el filtro de `listAssignableRoles` — el editor de roles
 * necesita ver también los "huérfanos" (sin módulo y sin is_super) para poder
 * arreglarlos, cosa que la lista de asignación no necesita. */
export async function listAllRoles(db: Db): Promise<RoleRow[]> {
  const { data, error } = await db.from("roles").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

/** Todas las filas de `role_permissions` — el caller (server component de
 * /usuarios) las agrupa por `role_id` para no hacer una consulta por rol. */
export async function listRolePermissionPairs(
  db: Db,
): Promise<{ role_id: string; permission_id: string }[]> {
  const { data, error } = await db.from("role_permissions").select("role_id, permission_id");
  if (error) throw error;
  return data ?? [];
}

export interface RoleInput {
  name: string;
  moduleCode: string | null;
  isSuper: boolean;
}

/** Crea un rol nuevo. `code` se autogenera del nombre (slug) — no es editable
 * después de creado. Si el slug ya existe como código de otro rol, el `unique`
 * de la tabla lo rechaza y el caller (server action) lo traduce a un mensaje
 * legible (ver 23505 en apps/web/lib/roles-actions.ts). */
export async function createRole(db: Db, input: RoleInput): Promise<RoleRow> {
  const { data, error } = await db
    .from("roles")
    .insert({
      code: slugify(input.name),
      name: input.name.trim(),
      module_code: input.moduleCode,
      is_super: input.isSuper,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Edita nombre/módulo/`is_super` de un rol existente. `code` nunca se toca. */
export async function updateRole(db: Db, roleId: string, input: RoleInput): Promise<RoleRow> {
  const { data, error } = await db
    .from("roles")
    .update({
      name: input.name.trim(),
      module_code: input.moduleCode,
      is_super: input.isSuper,
    })
    .eq("id", roleId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRole(db: Db, roleId: string): Promise<void> {
  const { error } = await db.from("roles").delete().eq("id", roleId);
  if (error) throw error;
}

/** Cuántos usuarios tienen este rol asignado hoy — usado para bloquear el
 * borrado de un rol en uso (ver deleteRoleAction). */
export async function countUsersWithRole(db: Db, roleId: string): Promise<number> {
  const { count, error } = await db
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (error) throw error;
  return count ?? 0;
}

/** Cuántos roles `is_super = true` DISTINTOS de `excludingRoleId` tiene
 * asignados este usuario — si da 0, quitarle is_super a `excludingRoleId` lo
 * dejaría sin ningún acceso de superadmin (ver updateRoleAction). */
export async function countOtherSuperRolesForUser(
  db: Db,
  userId: string,
  excludingRoleId: string,
): Promise<number> {
  const { data, error } = await db
    .from("user_roles")
    .select("role_id, roles(is_super)")
    .eq("user_id", userId)
    .neq("role_id", excludingRoleId);
  if (error) throw error;
  return (data ?? []).filter((row) => (row.roles as { is_super: boolean } | null)?.is_super)
    .length;
}

/** Reemplaza el set completo de permisos de un rol (borra + inserta) — mismo
 * patrón simple ya usado en el proyecto para "replace" de listas completas
 * (ver replaceQuoteItems). No hace falta el cuidado de concurrencia de
 * cotizaciones: editar los permisos de UN rol no lo hacen 10 personas a la
 * vez en la práctica. */
export async function setRolePermissions(
  db: Db,
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  const { error: deleteError } = await db.from("role_permissions").delete().eq("role_id", roleId);
  if (deleteError) throw deleteError;
  if (permissionIds.length === 0) return;
  const { error: insertError } = await db
    .from("role_permissions")
    .insert(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
  if (insertError) throw insertError;
}
