"use server";

import { revalidatePath } from "next/cache";
import {
  createQuoteStatus as createQuoteStatusRepo,
  deleteQuoteStatus as deleteQuoteStatusRepo,
  listQuoteStatuses,
  reorderQuoteStatuses as reorderQuoteStatusesRepo,
  updateQuoteStatus as updateQuoteStatusRepo,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type QuoteStatusActionResult = { ok: true; error?: never } | { ok?: never; error: string };

const HEX_RE = /^#[0-9a-f]{6}$/i;

type ManagerAuth =
  | { organizationId: string; error?: never }
  | { organizationId?: never; error: string };

async function requireManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote_status.manage")) {
    return { error: "No tienes permiso para administrar los estados." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId };
}

function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos (acentos)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "estado";
}

function revalidate() {
  revalidatePath("/crm/estados");
  revalidatePath("/crm");
}

export interface QuoteStatusInput {
  label: string;
  color: string;
  isSolid: boolean;
}

export async function createQuoteStatus(input: QuoteStatusInput): Promise<QuoteStatusActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };

  const label = input.label.trim();
  if (!label) return { error: "Escribe el nombre del estado." };
  if (!HEX_RE.test(input.color)) return { error: "Color inválido (usa formato #RRGGBB)." };

  try {
    const db = await getSupabaseServerClient();
    const existing = await listQuoteStatuses(db);
    // código único (slug) y sort_order al final
    const codes = new Set(existing.map((s) => s.code));
    let code = slugify(label);
    let n = 2;
    while (codes.has(code)) code = `${slugify(label)}_${n++}`;
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.sort_order), 0);

    await createQuoteStatusRepo(db, {
      organization_id: auth.organizationId,
      code,
      label,
      color: input.color,
      is_solid: input.isSolid,
      kind: "open",
      sort_order: maxOrder + 10,
      is_active: true,
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("createQuoteStatus", error);
    return { error: "No se pudo crear el estado. Intenta de nuevo." };
  }
}

export async function updateQuoteStatus(
  id: string,
  values: { label: string; color: string; isSolid: boolean },
): Promise<QuoteStatusActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };

  const label = values.label.trim();
  if (!label) return { error: "Escribe el nombre del estado." };
  if (!HEX_RE.test(values.color)) return { error: "Color inválido (usa formato #RRGGBB)." };

  try {
    const db = await getSupabaseServerClient();
    await updateQuoteStatusRepo(db, id, {
      label,
      color: values.color,
      is_solid: values.isSolid,
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("updateQuoteStatus", error);
    return { error: "No se pudo guardar el estado. Intenta de nuevo." };
  }
}

export async function toggleQuoteStatus(
  id: string,
  isActive: boolean,
): Promise<QuoteStatusActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await updateQuoteStatusRepo(db, id, { is_active: isActive });
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("toggleQuoteStatus", error);
    return { error: "No se pudo actualizar el estado. Intenta de nuevo." };
  }
}

export async function reorderQuoteStatuses(orderedIds: string[]): Promise<QuoteStatusActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await reorderQuoteStatusesRepo(db, orderedIds);
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("reorderQuoteStatuses", error);
    return { error: "No se pudo reordenar. Intenta de nuevo." };
  }
}

export async function deleteQuoteStatus(id: string): Promise<QuoteStatusActionResult> {
  const auth = await requireManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await deleteQuoteStatusRepo(db, id);
    revalidate();
    return { ok: true };
  } catch (error) {
    // El guard rechaza estados de sistema; la FK, estados con cotizaciones.
    console.error("deleteQuoteStatus", error);
    return {
      error:
        "No se pudo eliminar. Los estados de sistema no se borran, y un estado con cotizaciones asignadas tampoco (desactívalo).",
    };
  }
}
