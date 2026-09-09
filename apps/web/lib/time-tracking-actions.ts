"use server";

import { revalidatePath } from "next/cache";
import {
  deleteActiveTimer,
  deleteTimeEntry,
  getActiveTimer,
  getTimeEntry,
  insertTimeEntry,
  recordActivity,
  updateTimeEntry,
  upsertActiveTimer,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveTaskLink } from "@/lib/resolve-task-link";
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

/** Confirma que el work item existe y es de la org; devuelve lo necesario para
 * revalidar su path real (`resolveTaskLink`) en vez de toda `/proyectos`. */
async function loadWorkItem(
  db: Db,
  workItemId: string,
  organizationId: string,
): Promise<{ projectId: string; title: string } | null> {
  const { data } = await db
    .from("work_items")
    .select("project_id, title, organization_id")
    .eq("id", workItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || data.organization_id !== organizationId) return null;
  return { projectId: data.project_id, title: data.title };
}

/** Título de una tarea ya validada (usado con `entry.work_item_id`, cuya
 * pertenencia a la org ya se confirmó vía `entry.organization_id`). */
async function workItemTitle(db: Db, workItemId: string): Promise<string | null> {
  const { data } = await db.from("work_items").select("title").eq("id", workItemId).maybeSingle();
  return data?.title ?? null;
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
    const workItem = await loadWorkItem(db, input.workItemId, organizationId);
    if (!workItem) return { error: "La tarea no existe o no pertenece a tu organización." };
    const row = await insertTimeEntry(db, {
      organization_id: organizationId,
      work_item_id: input.workItemId,
      project_id: workItem.projectId,
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
    const link = await resolveTaskLink(db, workItem.projectId, {
      id: input.workItemId,
      title: workItem.title,
    });
    revalidatePath(link ?? "/proyectos");
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
    const title = await workItemTitle(db, entry.work_item_id);
    const link = title
      ? await resolveTaskLink(db, entry.project_id, { id: entry.work_item_id, title })
      : null;
    revalidatePath(link ?? "/proyectos");
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
    const title = await workItemTitle(db, entry.work_item_id);
    const link = title
      ? await resolveTaskLink(db, entry.project_id, { id: entry.work_item_id, title })
      : null;
    revalidatePath(link ?? "/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("deleteTimeEntryAction", error);
    return { error: "No se pudo borrar la entrada. Intenta de nuevo." };
  }
}

export type ActiveTimerDTO = { workItemId: string; startedAt: string };

/** Detiene el timer activo del usuario (si existe), creando su entrada de
 * tiempo (source='timer') si acumuló al menos 1 minuto. Devuelve los minutos
 * registrados (0 si no había timer o duró menos de 1 minuto). */
async function stopActiveTimer(db: Db, userId: string, organizationId: string): Promise<number> {
  const active = await getActiveTimer(db, userId);
  if (!active) return 0;
  const minutes = Math.round((Date.now() - new Date(active.started_at).getTime()) / 60000);
  const workItem = await loadWorkItem(db, active.work_item_id, organizationId);
  if (minutes >= 1 && workItem) {
    await insertTimeEntry(db, {
      organization_id: organizationId,
      work_item_id: active.work_item_id,
      project_id: workItem.projectId,
      user_id: userId,
      minutes,
      spent_on: new Date().toISOString().slice(0, 10),
      source: "timer",
    });
    try {
      await recordActivity(db, {
        orgId: organizationId,
        workItemId: active.work_item_id,
        actorUserId: userId,
        eventType: "time_logged",
        payload: { minutes, source: "timer" },
      });
    } catch (e) {
      console.error("stopActiveTimer:activity", e);
    }
  }
  await deleteActiveTimer(db, userId);
  return minutes >= 1 ? minutes : 0;
}

/** Inicia el cronómetro en una tarea. Si el usuario ya tenía uno corriendo en
 * otra tarea, lo detiene primero (crea su entrada) — auto-stop del previo. */
export async function startTimer(workItemId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) return { error: "No tienes permiso." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  try {
    const db = await getSupabaseServerClient();
    const workItem = await loadWorkItem(db, workItemId, organizationId);
    if (!workItem) return { error: "La tarea no existe o no pertenece a tu organización." };
    await stopActiveTimer(db, user.id, organizationId);
    await upsertActiveTimer(db, {
      user_id: user.id,
      organization_id: organizationId,
      work_item_id: workItemId,
    });
    const link = await resolveTaskLink(db, workItem.projectId, { id: workItemId, title: workItem.title });
    revalidatePath(link ?? "/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("startTimer", error);
    return { error: "No se pudo iniciar el cronómetro. Intenta de nuevo." };
  }
}

export async function stopTimer(): Promise<{ minutes: number; error?: never } | { minutes?: never; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  try {
    const db = await getSupabaseServerClient();
    const active = await getActiveTimer(db, user.id);
    const minutes = await stopActiveTimer(db, user.id, organizationId);
    let link: string | null = null;
    if (active) {
      const workItem = await loadWorkItem(db, active.work_item_id, organizationId);
      if (workItem) {
        link = await resolveTaskLink(db, workItem.projectId, {
          id: active.work_item_id,
          title: workItem.title,
        });
      }
    }
    revalidatePath(link ?? "/proyectos");
    return { minutes };
  } catch (error) {
    console.error("stopTimer", error);
    return { error: "No se pudo detener el cronómetro. Intenta de nuevo." };
  }
}

/** Timer activo del usuario (o null), para hidratar la UI al cargar la tarea. */
export async function getActiveTimerAction(): Promise<ActiveTimerDTO | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const db = await getSupabaseServerClient();
    const active = await getActiveTimer(db, user.id);
    if (!active) return null;
    return { workItemId: active.work_item_id, startedAt: active.started_at };
  } catch (error) {
    console.error("getActiveTimerAction", error);
    return null;
  }
}
