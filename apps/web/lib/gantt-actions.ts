"use server";

import { revalidatePath } from "next/cache";
import {
  createWorkItem,
  deleteDependency,
  insertDependency,
  listDependenciesForProject,
  listGanttTasks,
  bulkUpdateGanttDates,
  setAssignees,
  setGanttEnabled,
  updateWorkItem,
  type Db,
  type Enums,
} from "@agency-os/db";
import { cascadeForwardShift, isDirectCycle, isSelfDependency, validateWorkItemTitle } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveProjectLink } from "@/lib/resolve-task-link";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

type ManagerAuth =
  | { organizationId: string; userId: string; error?: never }
  | { organizationId?: never; userId?: never; error: string };

async function requireProjectManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.manage")) {
    return { error: "No tienes permiso para administrar proyectos." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

/** Confirma que el work item existe, es de la organización, y devuelve su
 * `project_id` y `type` — mismo propósito que `assertWorkItemInOrg` de
 * `project-actions.ts`, reimplementado acá porque ese helper no está
 * exportado. */
async function assertWorkItemInOrg(
  db: Db,
  id: string,
  organizationId: string,
): Promise<{ projectId: string; type: Enums<"work_item_type"> } | null> {
  const { data, error } = await db
    .from("work_items")
    .select("organization_id, project_id, type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return { projectId: data.project_id, type: data.type };
}

/** Recalcula la cascada a partir de `movedId` y persiste los corrimientos.
 * Compartido por `saveGanttTaskAction` y `updateGanttTaskDatesAction`. */
async function applyCascade(db: Db, projectId: string, movedId: string): Promise<void> {
  const [tasks, deps] = await Promise.all([
    listGanttTasks(db, projectId),
    listDependenciesForProject(db, projectId),
  ]);
  const dated = tasks.filter((t) => t.start_date && t.due_date);
  if (!dated.some((t) => t.id === movedId)) return;

  const updates = cascadeForwardShift(
    dated.map((t) => ({ id: t.id, startDate: t.start_date!, dueDate: t.due_date! })),
    deps.map((d) => ({ workItemId: d.work_item_id, dependsOnWorkItemId: d.depends_on_work_item_id })),
    movedId,
  );
  if (updates.length > 0) await bulkUpdateGanttDates(db, updates);
}

/** Activa la pestaña Gantt de un proyecto. Arranca vacío: no marca ninguna
 * tarea existente como `on_gantt`. */
export async function enableGanttAction(projectId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const found = await assertWorkItemInOrg(db, projectId, auth.organizationId);
    if (!found || found.type !== "project") {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }
    await setGanttEnabled(db, projectId, true);
    const link = await resolveProjectLink(db, projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("enableGanttAction", error);
    return { error: "No se pudo activar el Gantt. Intenta de nuevo." };
  }
}

export interface GanttTaskInput {
  /** id de la tarea existente; sin él, se crea una nueva. */
  id?: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  statusId?: string | null;
  assigneeIds: string[];
  /** Obligatorias en el Gantt (a diferencia de Tablero/Lista). */
  startDate: string;
  dueDate: string;
  /** Set completo de bloqueantes deseado para esta tarea (reemplaza-todo,
   * mismo patrón que `assigneeIds`/`setAssignees`). */
  dependsOnIds: string[];
}

/** Crea o edita una tarea del Gantt: fuerza `on_gantt = true`, exige fechas,
 * reemplaza el set de dependencias entrantes, y corre la cascada hacia sus
 * dependientes tras guardar. */
export async function saveGanttTaskAction(input: GanttTaskInput): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  const title = input.title.trim();
  const validation = validateWorkItemTitle(title);
  if (!validation.valid) return { error: validation.error ?? "Título inválido." };
  if (!input.startDate || !input.dueDate) return { error: "Fecha de inicio y fin son obligatorias." };
  if (input.dueDate < input.startDate) return { error: "La fecha de fin no puede ser anterior al inicio." };
  if (input.dependsOnIds.some((depId) => isSelfDependency(input.id ?? "", depId))) {
    return { error: "Una tarea no puede depender de sí misma." };
  }

  try {
    const db = await getSupabaseServerClient();
    const project = await assertWorkItemInOrg(db, input.projectId, auth.organizationId);
    if (!project || project.type !== "project") {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }

    let id = input.id;
    if (id) {
      const found = await assertWorkItemInOrg(db, id, auth.organizationId);
      if (!found) return { error: "La tarea no existe o no pertenece a tu organización." };
      await updateWorkItem(db, id, {
        title,
        status_id: input.statusId ?? null,
        start_date: input.startDate,
        due_date: input.dueDate,
        on_gantt: true,
      });
    } else {
      id = await createWorkItem(db, {
        orgId: auth.organizationId,
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        type: "task",
        title,
        statusId: input.statusId,
        dueDate: input.dueDate,
        onGantt: true,
      });
      await updateWorkItem(db, id, { start_date: input.startDate });
    }

    await setAssignees(db, id, auth.organizationId, input.assigneeIds);

    // Reemplaza el set de dependencias entrantes: borra las actuales de esta
    // tarea e inserta las nuevas, validando ciclo directo contra las que
    // quedan vigentes de OTRAS tareas del proyecto.
    const existing = await listDependenciesForProject(db, input.projectId);
    await Promise.all(
      existing.filter((d) => d.work_item_id === id).map((d) => deleteDependency(db, d.id)),
    );
    const remaining = existing.filter((d) => d.work_item_id !== id);
    for (const dependsOnId of input.dependsOnIds) {
      const candidate = { workItemId: id, dependsOnWorkItemId: dependsOnId };
      if (
        isDirectCycle(
          remaining.map((d) => ({ workItemId: d.work_item_id, dependsOnWorkItemId: d.depends_on_work_item_id })),
          candidate,
        )
      ) {
        return { error: `No se puede: crearía un ciclo de dependencia directo.` };
      }
      await insertDependency(db, {
        organizationId: auth.organizationId,
        workItemId: id,
        dependsOnWorkItemId: dependsOnId,
      });
    }

    await applyCascade(db, input.projectId, id);

    const link = await resolveProjectLink(db, input.projectId);
    if (link) revalidatePath(link);
    return { id };
  } catch (error) {
    console.error("saveGanttTaskAction", error);
    return { error: "No se pudo guardar la tarea. Intenta de nuevo." };
  }
}

/** Actualiza solo las fechas de una tarea del Gantt (drag de la barra) y corre
 * la cascada. Acción liviana separada de `saveGanttTaskAction` porque el drag
 * no toca título/estado/asignados/dependencias. */
export async function updateGanttTaskDatesAction(
  id: string,
  startDate: string,
  dueDate: string,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!startDate || !dueDate) return { error: "Fecha de inicio y fin son obligatorias." };
  if (dueDate < startDate) return { error: "La fecha de fin no puede ser anterior al inicio." };

  try {
    const db = await getSupabaseServerClient();
    const found = await assertWorkItemInOrg(db, id, auth.organizationId);
    if (!found) return { error: "La tarea no existe o no pertenece a tu organización." };

    await updateWorkItem(db, id, { start_date: startDate, due_date: dueDate });
    await applyCascade(db, found.projectId, id);

    const link = await resolveProjectLink(db, found.projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("updateGanttTaskDatesAction", error);
    return { error: "No se pudo mover la tarea. Intenta de nuevo." };
  }
}

export async function addDependencyAction(
  workItemId: string,
  dependsOnWorkItemId: string,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (isSelfDependency(workItemId, dependsOnWorkItemId)) {
    return { error: "Una tarea no puede depender de sí misma." };
  }

  try {
    const db = await getSupabaseServerClient();
    const found = await assertWorkItemInOrg(db, workItemId, auth.organizationId);
    if (!found) return { error: "La tarea no existe o no pertenece a tu organización." };

    const existing = await listDependenciesForProject(db, found.projectId);
    const candidate = { workItemId, dependsOnWorkItemId };
    const edges = existing.map((d) => ({
      workItemId: d.work_item_id,
      dependsOnWorkItemId: d.depends_on_work_item_id,
    }));
    if (isDirectCycle(edges, candidate)) {
      return { error: "Crearía un ciclo de dependencia directo." };
    }

    await insertDependency(db, { organizationId: auth.organizationId, workItemId, dependsOnWorkItemId });
    const link = await resolveProjectLink(db, found.projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("addDependencyAction", error);
    return { error: "No se pudo agregar la dependencia. Intenta de nuevo." };
  }
}

export async function removeDependencyAction(id: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await deleteDependency(db, id);
    return { ok: true };
  } catch (error) {
    console.error("removeDependencyAction", error);
    return { error: "No se pudo quitar la dependencia. Intenta de nuevo." };
  }
}
