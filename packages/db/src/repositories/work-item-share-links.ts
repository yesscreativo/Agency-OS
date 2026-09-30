import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type ShareLinkRow = Tables<"work_item_share_links">;

export async function getShareLinkByProject(db: Db, projectId: string): Promise<ShareLinkRow | null> {
  const { data, error } = await db
    .from("work_item_share_links")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Resuelve por token — usado por la ruta pública con `service_role`. */
export async function getShareLinkByToken(db: Db, token: string): Promise<ShareLinkRow | null> {
  const { data, error } = await db.from("work_item_share_links").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createShareLink(
  db: Db,
  values: { organizationId: string; projectId: string; createdBy: string },
): Promise<ShareLinkRow> {
  const { data, error } = await db
    .from("work_item_share_links")
    .insert({ organization_id: values.organizationId, project_id: values.projectId, created_by: values.createdBy })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function revokeShareLink(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("work_item_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteShareLink(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_share_links").delete().eq("id", id);
  if (error) throw error;
}
