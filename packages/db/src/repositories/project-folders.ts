import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type ProjectFolderRow = Tables<"project_folders">;

/** Carpetas de un cliente, en orden de `sort_order`. */
export async function listProjectFolders(db: Db, clientId: string): Promise<ProjectFolderRow[]> {
  const { data, error } = await db
    .from("project_folders")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function createProjectFolder(
  db: Db,
  input: {
    organizationId: string;
    clientId: string;
    name: string;
    color: string;
    createdBy: string;
  },
): Promise<ProjectFolderRow> {
  const { count, error: countError } = await db
    .from("project_folders")
    .select("*", { count: "exact", head: true })
    .eq("client_id", input.clientId);
  if (countError) throw countError;
  const { data, error } = await db
    .from("project_folders")
    .insert({
      organization_id: input.organizationId,
      client_id: input.clientId,
      name: input.name.trim(),
      color: input.color,
      sort_order: count ?? 0,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProjectFolder(
  db: Db,
  id: string,
  input: { name: string; color: string },
): Promise<ProjectFolderRow> {
  const { data, error } = await db
    .from("project_folders")
    .update({ name: input.name.trim(), color: input.color })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProjectFolder(db: Db, id: string): Promise<void> {
  const { error } = await db.from("project_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderProjectFolders(db: Db, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("project_folders").update({ sort_order: index }).eq("id", id);
    if (error) throw error;
  }
}

/** Confirma organización/cliente de una carpeta antes de editarla/borrarla —
 * mismo patrón de "defensa en profundidad" que `assertStatusInOrg` en
 * project-actions.ts. */
export async function getProjectFolderOrg(
  db: Db,
  id: string,
): Promise<{ organizationId: string; clientId: string } | null> {
  const { data, error } = await db
    .from("project_folders")
    .select("organization_id, client_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { organizationId: data.organization_id, clientId: data.client_id };
}
