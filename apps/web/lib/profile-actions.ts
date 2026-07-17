"use server";

import { revalidatePath } from "next/cache";
import { updatePersonName } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ProfileActionResult = { ok: true; error?: never } | { ok?: never; error: string };

/** Cada usuario administra su propio nombre (policy people_self_update). */
export async function updateMyProfile(fullName: string): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!user.personId) return { error: "No se encontró tu perfil." };

  const trimmed = fullName.trim();
  if (!trimmed) return { error: "Escribe tu nombre." };

  try {
    const db = await getSupabaseServerClient();
    await updatePersonName(db, user.personId, trimmed);
    revalidatePath("/perfil");
    revalidatePath("/inicio");
    return { ok: true };
  } catch (error) {
    console.error("updateMyProfile", error);
    return { error: "No se pudo guardar el nombre. Intenta de nuevo." };
  }
}
