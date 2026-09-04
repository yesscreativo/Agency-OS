"use server";

import { revalidatePath } from "next/cache";
import { getPerson, updatePersonAvatar, updatePersonName } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ProfileActionResult = { ok: true; error?: never } | { ok?: never; error: string };

const AVATAR_BUCKET = "user-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (paridad con el bucket, ver 024)
// SVG excluido: bucket público → un SVG inline puede ejecutar scripts (XSS).
const ALLOWED_AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type AvatarResult =
  | { avatarUrl: string | null; error?: never }
  | { avatarUrl?: never; error: string };

/** Sube (o reemplaza) el avatar del propio usuario y devuelve su URL pública.
 * La ruta empieza por el auth.uid() (policy de dueño del bucket, ver 024). */
export async function uploadMyAvatar(formData: FormData): Promise<AvatarResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!user.personId) return { error: "No se encontró tu perfil." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona una imagen." };
  if (file.size > MAX_AVATAR_BYTES) return { error: "La imagen supera el límite de 2 MB." };
  if (!ALLOWED_AVATAR_MIME.has(file.type)) {
    return { error: "Formato no permitido. Usa PNG, JPG, WEBP o GIF." };
  }

  try {
    const db = await getSupabaseServerClient();
    const person = await getPerson(db, user.personId);
    const previousPath = person?.avatar_url ?? null;

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await db.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error("uploadMyAvatar:storage", upErr);
      return { error: "No se pudo subir la imagen." };
    }

    await updatePersonAvatar(db, user.personId, path);

    // Borra el avatar anterior para no dejar huérfanos.
    if (previousPath && previousPath !== path) {
      await db.storage.from(AVATAR_BUCKET).remove([previousPath]);
    }

    revalidatePath("/perfil");
    revalidatePath("/", "layout");
    return { avatarUrl: db.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl ?? null };
  } catch (error) {
    console.error("uploadMyAvatar", error);
    return { error: "No se pudo subir la imagen. Intenta de nuevo." };
  }
}

/** Quita el avatar del propio usuario (borra el archivo y limpia la columna). */
export async function removeMyAvatar(): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!user.personId) return { error: "No se encontró tu perfil." };

  try {
    const db = await getSupabaseServerClient();
    const person = await getPerson(db, user.personId);
    if (person?.avatar_url) {
      await db.storage.from(AVATAR_BUCKET).remove([person.avatar_url]);
    }
    await updatePersonAvatar(db, user.personId, null);
    revalidatePath("/perfil");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("removeMyAvatar", error);
    return { error: "No se pudo quitar la imagen. Intenta de nuevo." };
  }
}

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
