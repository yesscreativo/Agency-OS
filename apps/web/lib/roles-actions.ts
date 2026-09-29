"use server";

import { revalidatePath } from "next/cache";
import {
  countOtherSuperRolesForUser,
  countUsersWithRole,
  createRole,
  createSupabaseServiceRoleClient,
  deleteRole,
  setRolePermissions,
  updateRole,
  type RoleInput,
} from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/access-guard";

export type RolesActionResult = { ok: true; error?: never } | { ok?: never; error: string };

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

export async function createRoleAction(input: RoleInput): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre del rol es obligatorio." };

  try {
    const admin = createSupabaseServiceRoleClient();
    await createRole(admin, input);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ya existe un rol con un nombre igual o muy parecido." };
    }
    console.error("createRoleAction", error);
    return { error: "No se pudo crear el rol. Intenta de nuevo." };
  }
}

export async function updateRoleAction(
  roleId: string,
  input: RoleInput,
): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre del rol es obligatorio." };

  try {
    const admin = createSupabaseServiceRoleClient();

    // Si se le está quitando is_super a este rol, verificar que quien ejecuta
    // la acción no dependa de ÉL para seguir siendo superadmin — si es su
    // único rol is_super, quedaría sin acceso al propio editor.
    if (!input.isSuper) {
      const currentUser = await getCurrentUser();
      if (currentUser?.isSuper) {
        const otherSuperRoles = await countOtherSuperRolesForUser(admin, currentUser.id, roleId);
        if (otherSuperRoles === 0) {
          return {
            error: "No puedes quitarle superadmin al único rol que te da acceso de administrador.",
          };
        }
      }
    }

    await updateRole(admin, roleId, input);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ya existe un rol con un nombre igual o muy parecido." };
    }
    console.error("updateRoleAction", error);
    return { error: "No se pudo actualizar el rol. Intenta de nuevo." };
  }
}

export async function deleteRoleAction(roleId: string): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const admin = createSupabaseServiceRoleClient();
    const usersWithRole = await countUsersWithRole(admin, roleId);
    if (usersWithRole > 0) {
      return {
        error: `Este rol tiene ${usersWithRole} usuario(s) asignado(s). Quítaselo a todos antes de eliminarlo.`,
      };
    }
    await deleteRole(admin, roleId);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("deleteRoleAction", error);
    return { error: "No se pudo eliminar el rol. Intenta de nuevo." };
  }
}

export async function setRolePermissionsAction(
  roleId: string,
  permissionIds: string[],
): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const admin = createSupabaseServiceRoleClient();
    await setRolePermissions(admin, roleId, permissionIds);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("setRolePermissionsAction", error);
    return { error: "No se pudieron guardar los permisos. Intenta de nuevo." };
  }
}
