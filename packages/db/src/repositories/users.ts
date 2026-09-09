import type { Db } from "./shared";

export interface OrgUserRoleAssignment {
  /** id de la fila user_roles (para revocar). */
  userRoleId: string;
  roleCode: string;
  roleName: string;
  moduleCode: string | null;
}

export interface OrgUser {
  id: string;
  /** id de la fila `people` (distinto de `id`, que es el de `users`/auth). */
  personId: string;
  fullName: string;
  email: string | null;
  /** URL pública del avatar (bucket user-avatars) o null si usa iniciales. */
  avatarUrl: string | null;
  areaId: string | null;
  areaName: string | null;
  roles: OrgUserRoleAssignment[];
}

type OrgUserRow = {
  id: string;
  person_id: string;
  person: {
    organization_id: string;
    full_name: string;
    email: string | null;
    avatar_url: string | null;
    area_id: string | null;
    area: { id: string; name: string } | null;
  } | null;
  user_roles: {
    id: string;
    organization_id: string;
    roles: { code: string; name: string; module_code: string | null } | null;
  }[];
};

/** Usuarios (con login) del org y sus roles por módulo. Un usuario "pendiente"
 * es el que no tiene ninguna asignación en ningún lado todavía.
 *
 * La query no puede filtrar `.eq("organization_id", ...)` directamente:
 * `users` no tiene esa columna, y filtrar por la relación embebida
 * (`user_roles.organization_id`) excluiría a los pendientes, que no tienen
 * ninguna fila en `user_roles`. Por eso se trae todo lo que permite RLS (que
 * hoy cubre "cualquiera de mis organizaciones", no el `organizationId`
 * puntual recibido) y se recorta en memoria replicando las mismas dos
 * condiciones de `users_select` (011_pending_users_visibility.sql): tiene rol
 * en ESTA organización, o está pendiente y su `people.organization_id` es
 * ESTA organización. Sin este filtro, un usuario con acceso a más de una
 * organización vería acá también usuarios de sus otras orgs. */
export async function listOrgUsers(db: Db, organizationId: string): Promise<OrgUser[]> {
  const { data, error } = await db
    .from("users")
    .select(
      "id, person_id, person:people!inner(organization_id, full_name, email, avatar_url, area_id, area:areas(id, name)), user_roles(id, organization_id, roles(code, name, module_code))",
    )
    .is("deleted_at", null)
    .returns<OrgUserRow[]>();
  if (error) throw error;

  return (data ?? [])
    .filter((row) => {
      const hasRoleHere = row.user_roles.some((ur) => ur.organization_id === organizationId && ur.roles);
      const isPendingHere = row.user_roles.length === 0 && row.person?.organization_id === organizationId;
      return hasRoleHere || isPendingHere;
    })
    .map((row) => ({
      id: row.id,
      personId: row.person_id,
      fullName: row.person?.full_name ?? row.person?.email ?? "—",
      email: row.person?.email ?? null,
      avatarUrl: row.person?.avatar_url
        ? (db.storage.from("user-avatars").getPublicUrl(row.person.avatar_url).data.publicUrl ?? null)
        : null,
      areaId: row.person?.area_id ?? null,
      areaName: row.person?.area?.name ?? null,
      roles: row.user_roles
        .filter((ur) => ur.organization_id === organizationId && ur.roles)
        .map((ur) => ({
          userRoleId: ur.id,
          roleCode: ur.roles!.code,
          roleName: ur.roles!.name,
          moduleCode: ur.roles!.module_code,
        })),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}

/** Asigna un rol a un usuario en un org (idempotente por el unique del esquema). */
export async function grantUserRole(
  db: Db,
  params: { userId: string; roleId: string; organizationId: string },
): Promise<void> {
  const { error } = await db.from("user_roles").insert({
    user_id: params.userId,
    role_id: params.roleId,
    organization_id: params.organizationId,
  });
  if (error) throw error;
}

export async function revokeUserRole(db: Db, userRoleId: string): Promise<void> {
  const { error } = await db.from("user_roles").delete().eq("id", userRoleId);
  if (error) throw error;
}
