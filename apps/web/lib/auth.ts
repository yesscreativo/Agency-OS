import "server-only";
import { getSupabaseServerClient } from "./supabase-server";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  organizationIds: string[];
  roles: { code: string; name: string }[];
  permissionCodes: Set<string>;
}

type UserRoleRow = {
  organization_id: string;
  roles: {
    code: string;
    name: string;
    role_permissions: { permissions: { code: string } | null }[];
  } | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("id, people(full_name)")
    .eq("id", user.id)
    .single();

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("organization_id, roles(code, name, role_permissions(permissions(code)))")
    .eq("user_id", user.id)
    .returns<UserRoleRow[]>();

  const roles = (userRoles ?? [])
    .map((ur) => ur.roles)
    .filter((role): role is NonNullable<UserRoleRow["roles"]> => role !== null)
    .map((role) => ({ code: role.code, name: role.name }));

  const permissionCodes = new Set<string>();
  for (const ur of userRoles ?? []) {
    for (const rp of ur.roles?.role_permissions ?? []) {
      if (rp.permissions?.code) permissionCodes.add(rp.permissions.code);
    }
  }

  const organizationIds = [...new Set((userRoles ?? []).map((ur) => ur.organization_id))];

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: (appUser as { people: { full_name: string } | null } | null)?.people?.full_name ?? user.email ?? "",
    organizationIds,
    roles,
    permissionCodes,
  };
}

export function hasPermission(user: CurrentUser | null, code: string): boolean {
  return user?.permissionCodes.has(code) ?? false;
}
