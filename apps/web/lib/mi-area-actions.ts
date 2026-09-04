"use server";

import { revalidatePath } from "next/cache";
import { assignPersonJobTitle, createJobTitle, getArea, renameJobTitle } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };

/** Guarda: super admin, o gerente de ESTA área puntual (`areaId`). Puerta de
 * dueño, no de permiso de rol — igual que "autor del comentario". */
async function requireAreaManager(areaId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  if (user.isSuper) return { organizationId } as const;

  const db = await getSupabaseServerClient();
  const area = await getArea(db, areaId);
  if (!area || area.organization_id !== organizationId || area.manager_user_id !== user.id) {
    return { error: "No administras esta área." } as const;
  }
  return { organizationId } as const;
}

export async function createJobTitleAction(areaId: string, name: string): Promise<AccessActionResult> {
  const auth = await requireAreaManager(areaId);
  if (auth.error !== undefined) return { error: auth.error };
  if (!name.trim()) return { error: "El nombre es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    await createJobTitle(db, { organizationId: auth.organizationId, areaId, name: name.trim() });
    revalidatePath("/mi-area");
    return { ok: true };
  } catch (error) {
    console.error("createJobTitleAction", error);
    return { error: "No se pudo crear el cargo. Intenta de nuevo." };
  }
}

export async function renameJobTitleAction(
  id: string,
  areaId: string,
  name: string,
): Promise<AccessActionResult> {
  const auth = await requireAreaManager(areaId);
  if (auth.error !== undefined) return { error: auth.error };
  if (!name.trim()) return { error: "El nombre es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    await renameJobTitle(db, id, name.trim());
    revalidatePath("/mi-area");
    return { ok: true };
  } catch (error) {
    console.error("renameJobTitleAction", error);
    return { error: "No se pudo renombrar el cargo. Intenta de nuevo." };
  }
}

export async function assignPersonJobTitleAction(
  personId: string,
  areaId: string,
  jobTitleId: string | null,
): Promise<AccessActionResult> {
  const auth = await requireAreaManager(areaId);
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await assignPersonJobTitle(db, personId, jobTitleId);
    revalidatePath("/mi-area");
    return { ok: true };
  } catch (error) {
    console.error("assignPersonJobTitleAction", error);
    return { error: "No se pudo asignar el cargo. Intenta de nuevo." };
  }
}
