"use server";

import { revalidatePath } from "next/cache";
import { createKam as createKamRepo, updateKam } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type KamActionResult = { ok: true; error?: never } | { ok?: never; error: string };

type ManagerAuth =
  | { organizationId: string; error?: never }
  | { organizationId?: never; error: string };

async function requireManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "kam.manage")) {
    return { error: "No tienes permiso para administrar KAMs/PMs." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId };
}

export async function createKam(name: string): Promise<KamActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Escribe el nombre de la KAM/PM." };

  try {
    const db = await getSupabaseServerClient();
    await createKamRepo(db, { name: trimmed, organization_id: auth.organizationId });
    revalidatePath("/crm/kams");
    return { ok: true };
  } catch (error) {
    console.error("createKam", error);
    return { error: "No se pudo crear la KAM/PM. Intenta de nuevo." };
  }
}

export async function renameKam(id: string, name: string): Promise<KamActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Escribe el nombre de la KAM/PM." };

  try {
    const db = await getSupabaseServerClient();
    await updateKam(db, id, { name: trimmed });
    revalidatePath("/crm/kams");
    return { ok: true };
  } catch (error) {
    console.error("renameKam", error);
    return { error: "No se pudo renombrar la KAM/PM. Intenta de nuevo." };
  }
}

export async function toggleKam(id: string, isActive: boolean): Promise<KamActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await updateKam(db, id, { is_active: isActive });
    revalidatePath("/crm/kams");
    return { ok: true };
  } catch (error) {
    console.error("toggleKam", error);
    return { error: "No se pudo actualizar la KAM/PM. Intenta de nuevo." };
  }
}
