"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceRoleClient, grantUserRole, revokeUserRole } from "@agency-os/db";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };

// Asignar accesos y crear usuarios es exclusivo del Administrador de sistema
// (is_super) — no del permiso puntual users.manage, que hoy también podría
// tener un admin de un módulo (ej. CRM) sin que eso le dé control global.
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  if (!user.isSuper) {
    return { error: "Solo un Administrador de sistema puede gestionar accesos." } as const;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  return { organizationId } as const;
}

export async function grantRole(userId: string, roleId: string): Promise<AccessActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!userId || !roleId) return { error: "Selecciona usuario y rol." };

  try {
    const db = await getSupabaseServerClient();
    await grantUserRole(db, { userId, roleId, organizationId: auth.organizationId });
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    // El unique (user, role, org) evita duplicados; si ya lo tiene, lo tratamos como éxito.
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return { ok: true };
    }
    console.error("grantRole", error);
    return { error: "No se pudo asignar el rol. Intenta de nuevo." };
  }
}

export async function revokeRole(userRoleId: string): Promise<AccessActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!userRoleId) return { error: "Asignación inválida." };

  try {
    const db = await getSupabaseServerClient();
    await revokeUserRole(db, userRoleId);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("revokeRole", error);
    return { error: "No se pudo revocar el acceso. Intenta de nuevo." };
  }
}

/** Crea la cuenta de auth de una persona antes de que inicie sesión (envía un
 * enlace de invitación). El trigger de la BD crea people/users automáticamente
 * al insertarse en auth.users; queda "Pendiente" hasta que se le asigne un rol. */
export async function inviteUser(email: string, fullName: string): Promise<AccessActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };

  const trimmedEmail = email.trim().toLowerCase();
  if (!isAllowedEmailDomain(trimmedEmail)) {
    return { error: "Solo se permiten correos @laburuagencia.com." };
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
      data: { full_name: fullName.trim() || undefined },
    });
    if (error) throw error;
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("inviteUser", error);
    return { error: "No se pudo invitar al usuario. Verifica el correo e intenta de nuevo." };
  }
}
