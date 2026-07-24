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
  fullName: string;
  email: string | null;
  roles: OrgUserRoleAssignment[];
}

type OrgUserRow = {
  id: string;
  person: { full_name: string; email: string | null } | null;
  user_roles: {
    id: string;
    organization_id: string;
    roles: { code: string; name: string; module_code: string | null } | null;
  }[];
};

/** Usuarios (con login) del org y sus roles por módulo. Un usuario "pendiente"
 * es el que no tiene ninguna asignación. RLS limita a la organización. */
export async function listOrgUsers(db: Db, organizationId: string): Promise<OrgUser[]> {
  const { data, error } = await db
    .from("users")
    .select(
      "id, person:people!inner(full_name, email), user_roles(id, organization_id, roles(code, name, module_code))",
    )
    .is("deleted_at", null)
    .returns<OrgUserRow[]>();
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      fullName: row.person?.full_name ?? row.person?.email ?? "—",
      email: row.person?.email ?? null,
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
