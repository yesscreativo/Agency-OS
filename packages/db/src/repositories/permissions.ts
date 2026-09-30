import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type PermissionRow = Tables<"permissions">;

/** Catálogo completo de permisos (fijo, se mantiene por migración) — el
 * editor de roles solo lee de aquí para armar los checkboxes por rol. */
export async function listPermissions(db: Db): Promise<PermissionRow[]> {
  const { data, error } = await db.from("permissions").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}

/** user_id de todos los que tienen `code` en alguno de sus roles, dentro de
 * `orgId`. 3 queries chicas en vez de un embed anidado (más simple y
 * confiable que filtrar por columna de una tabla 2 niveles más abajo en
 * PostgREST). Para notificaciones "a todo el rol X" (ej. RRHH). */
export async function listUsersWithPermission(db: Db, orgId: string, code: string): Promise<string[]> {
  const { data: perm, error: permError } = await db
    .from("permissions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (permError) throw permError;
  if (!perm) return [];

  const { data: rolePerms, error: rpError } = await db
    .from("role_permissions")
    .select("role_id")
    .eq("permission_id", perm.id);
  if (rpError) throw rpError;
  const roleIds = (rolePerms ?? []).map((r) => r.role_id);
  if (roleIds.length === 0) return [];

  const { data: userRoles, error: urError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", orgId)
    .in("role_id", roleIds);
  if (urError) throw urError;
  return Array.from(new Set((userRoles ?? []).map((r) => r.user_id)));
}
