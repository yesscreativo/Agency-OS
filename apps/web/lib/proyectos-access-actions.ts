"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceRoleClient, grantUserRole, revokeUserRole } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };

/** Guarda común: exige project.manage_access (proyectos_admin o super admin).
 * Puerta separada de users.manage — nunca se mezclan. */
async function requireProjectAccessManager() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  if (!hasPermission(user, "project.manage_access")) {
    return { error: "No tienes permiso para gestionar accesos de Proyectos." } as const;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  return { organizationId } as const;
}

export async function grantProjectRole(userId: string, roleId: string): Promise<AccessActionResult> {
  const auth = await requireProjectAccessManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!userId || !roleId) return { error: "Selecciona usuario y rol." };

  try {
    const db = await getSupabaseServerClient();
    // Defensa en profundidad: el rol objetivo debe ser de Proyectos, sin
    // importar qué mande el cliente — así esta puerta nunca sirve para tocar
    // Administrador ni roles de otro módulo.
    const { data: role } = await db
      .from("roles")
      .select("module_code")
      .eq("id", roleId)
      .maybeSingle();
    if (!role || role.module_code !== "proyectos") {
      return { error: "Rol inválido." };
    }
    // user_roles_write exige users.manage, que un proyectos_admin no super
    // admin no tiene — se usa service role para el write puntual, ya
    // validado arriba (rol de Proyectos) y por requireProjectAccessManager
    // (organización + project.manage_access).
    const admin = createSupabaseServiceRoleClient();
    await grantUserRole(admin, { userId, roleId, organizationId: auth.organizationId });
    revalidatePath("/proyectos/usuarios");
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return { ok: true };
    }
    console.error("grantProjectRole", error);
    return { error: "No se pudo asignar el rol. Intenta de nuevo." };
  }
}

export async function revokeProjectRole(userRoleId: string): Promise<AccessActionResult> {
  const auth = await requireProjectAccessManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!userRoleId) return { error: "Asignación inválida." };

  try {
    const db = await getSupabaseServerClient();
    const { data: row } = await db
      .from("user_roles")
      .select("id, organization_id, role_id")
      .eq("id", userRoleId)
      .maybeSingle();
    if (!row || row.organization_id !== auth.organizationId) {
      return { error: "Asignación inválida." };
    }
    const { data: role } = await db
      .from("roles")
      .select("module_code")
      .eq("id", row.role_id)
      .maybeSingle();
    if (!role || role.module_code !== "proyectos") {
      return { error: "Asignación inválida." };
    }
    // Mismo motivo que en grantProjectRole: user_roles_write exige
    // users.manage, así que el delete puntual va con service role, ya
    // validado arriba (fila de la misma organización y rol de Proyectos).
    const admin = createSupabaseServiceRoleClient();
    await revokeUserRole(admin, userRoleId);
    revalidatePath("/proyectos/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("revokeProjectRole", error);
    return { error: "No se pudo revocar el acceso. Intenta de nuevo." };
  }
}
