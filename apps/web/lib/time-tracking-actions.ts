"use server";

import { revalidatePath } from "next/cache";
import {
  deleteTimeEntry,
  getTimeEntry,
  insertTimeEntry,
  recordActivity,
  updateTimeEntry,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Db } from "@agency-os/db";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

/** DTO de UI para una entrada de tiempo (Fase 2: listado en la ficha de la tarea). */
export type TimeEntryDTO = {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  minutes: number;
  spentOn: string;
  note: string | null;
  source: string;
};

/** Confirma que el work item existe y es de la org; devuelve su project_id. */
async function workItemProjectId(
  db: Db,
  workItemId: string,
  organizationId: string,
): Promise<string | null> {
  const { data } = await db
    .from("work_items")
    .select("project_id, organization_id")
    .eq("id", workItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || data.organization_id !== organizationId) return null;
  return data.project_id;
}

export async function addTimeEntry(input: {
  workItemId: string;
  minutes: number;
  spentOn: string;
  note?: string | null;
}): Promise<IdResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) return { error: "No tienes permiso." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    return { error: "La duración debe ser mayor a cero." };
  }
  try {
    const db = await getSupabaseServerClient();
    const projectId = await workItemProjectId(db, input.workItemId, organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };
    const row = await insertTimeEntry(db, {
      organization_id: organizationId,
      work_item_id: input.workItemId,
      project_id: projectId,
      user_id: user.id,
      minutes: Math.round(input.minutes),
      spent_on: input.spentOn,
      note: input.note?.trim() || null,
      source: "manual",
    });
    try {
      await recordActivity(db, {
        orgId: organizationId,
        workItemId: input.workItemId,
        actorUserId: user.id,
        eventType: "time_logged",
        payload: { minutes: Math.round(input.minutes), source: "manual" },
      });
    } catch (e) {
      console.error("addTimeEntry:activity", e);
    }
    revalidatePath("/proyectos");
    return { id: row.id };
  } catch (error) {
    console.error("addTimeEntry", error);
    return { error: "No se pudo registrar el tiempo. Intenta de nuevo." };
  }
}

export async function editTimeEntry(input: {
  id: string;
  minutes: number;
  spentOn: string;
  note?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    return { error: "La duración debe ser mayor a cero." };
  }
  try {
    const db = await getSupabaseServerClient();
    const entry = await getTimeEntry(db, input.id);
    if (!entry || entry.organization_id !== organizationId) {
      return { error: "La entrada no existe o no pertenece a tu organización." };
    }
    if (entry.user_id !== user.id && !hasPermission(user, "project.manage")) {
      return { error: "Solo puedes editar tus propias entradas." };
    }
    await updateTimeEntry(db, input.id, {
      minutes: Math.round(input.minutes),
      spent_on: input.spentOn,
      note: input.note?.trim() || null,
    });
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("editTimeEntry", error);
    return { error: "No se pudo editar la entrada. Intenta de nuevo." };
  }
}

export async function deleteTimeEntryAction(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  try {
    const db = await getSupabaseServerClient();
    const entry = await getTimeEntry(db, id);
    if (!entry || entry.organization_id !== organizationId) {
      return { error: "La entrada no existe o no pertenece a tu organización." };
    }
    if (entry.user_id !== user.id && !hasPermission(user, "project.manage")) {
      return { error: "Solo puedes borrar tus propias entradas." };
    }
    await deleteTimeEntry(db, id);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("deleteTimeEntryAction", error);
    return { error: "No se pudo borrar la entrada. Intenta de nuevo." };
  }
}
