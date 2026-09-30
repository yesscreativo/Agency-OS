import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type DependencyRow = Tables<"work_item_dependencies">;

/** Dependencias de todas las tareas de un proyecto (para armar los conectores
 * del Gantt y correr la cascada). Trae por `project_id` embebiendo el work
 * item bloqueado, ya que `work_item_dependencies` no tiene `project_id` propio. */
export async function listDependenciesForProject(db: Db, projectId: string): Promise<DependencyRow[]> {
  const { data, error } = await db
    .from("work_item_dependencies")
    .select("*, work_item:work_items!work_item_dependencies_work_item_id_fkey(project_id)")
    .returns<(DependencyRow & { work_item: { project_id: string } | null })[]>();
  if (error) throw error;
  return (data ?? []).filter((row) => row.work_item?.project_id === projectId);
}

export async function getDependencyById(db: Db, id: string): Promise<DependencyRow | null> {
  const { data, error } = await db.from("work_item_dependencies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertDependency(
  db: Db,
  values: { organizationId: string; workItemId: string; dependsOnWorkItemId: string },
): Promise<DependencyRow> {
  const { data, error } = await db
    .from("work_item_dependencies")
    .insert({
      organization_id: values.organizationId,
      work_item_id: values.workItemId,
      depends_on_work_item_id: values.dependsOnWorkItemId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDependency(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_dependencies").delete().eq("id", id);
  if (error) throw error;
}
