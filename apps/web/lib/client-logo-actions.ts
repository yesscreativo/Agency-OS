"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const LOGO_BUCKET = "client-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB (paridad con el bucket, ver 022)
// SVG excluido a propósito: el bucket es público y un SVG servido inline puede
// ejecutar scripts (XSS). Solo imágenes raster.
const ALLOWED_LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type LogoResult = { logoUrl: string | null; error?: never } | { logoUrl?: never; error: string };
type OkResult = { ok: true; error?: never } | { ok?: never; error: string };

type AuthResult =
  | { error: string; organizationId?: never; userId?: never }
  | { error?: never; organizationId: string; userId: string };

async function auth(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.manage")) {
    return { error: "No tienes permiso para editar el cliente." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

/** Sube (o reemplaza) el logo de un cliente y devuelve su URL pública. */
export async function uploadClientLogo(clientId: string, formData: FormData): Promise<LogoResult> {
  const a = await auth();
  if (a.error) return { error: a.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona una imagen." };
  if (file.size > MAX_LOGO_BYTES) return { error: "La imagen supera el límite de 2 MB." };
  if (!ALLOWED_LOGO_MIME.has(file.type)) {
    return { error: "Formato no permitido. Usa PNG, JPG, WEBP o GIF." };
  }

  try {
    const db = await getSupabaseServerClient();

    const { data: client, error: cErr } = await db
      .from("clients")
      .select("id, organization_id, logo_path")
      .eq("id", clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client || client.organization_id !== a.organizationId) {
      return { error: "El cliente no existe o no pertenece a tu organización." };
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${a.organizationId}/${clientId}/${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await db.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error("uploadClientLogo:storage", upErr);
      return { error: "No se pudo subir el logo." };
    }

    const { error: updErr } = await db.from("clients").update({ logo_path: path }).eq("id", clientId);
    if (updErr) throw updErr;

    // Borra el logo anterior (si lo había) para no dejar huérfanos.
    if (client.logo_path && client.logo_path !== path) {
      await db.storage.from(LOGO_BUCKET).remove([client.logo_path]);
    }

    revalidatePath("/proyectos");
    return { logoUrl: db.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl ?? null };
  } catch (error) {
    console.error("uploadClientLogo", error);
    return { error: "No se pudo subir el logo. Intenta de nuevo." };
  }
}

/** Quita el logo de un cliente (borra el archivo y limpia la columna). */
export async function removeClientLogo(clientId: string): Promise<OkResult> {
  const a = await auth();
  if (a.error) return { error: a.error };

  try {
    const db = await getSupabaseServerClient();
    const { data: client, error: cErr } = await db
      .from("clients")
      .select("id, organization_id, logo_path")
      .eq("id", clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client || client.organization_id !== a.organizationId) {
      return { error: "El cliente no existe o no pertenece a tu organización." };
    }

    if (client.logo_path) {
      await db.storage.from(LOGO_BUCKET).remove([client.logo_path]);
    }
    const { error: updErr } = await db.from("clients").update({ logo_path: null }).eq("id", clientId);
    if (updErr) throw updErr;

    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("removeClientLogo", error);
    return { error: "No se pudo quitar el logo. Intenta de nuevo." };
  }
}
