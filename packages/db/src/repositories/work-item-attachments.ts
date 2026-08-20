import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type AttachmentRow = Tables<"work_item_attachments">;

/** Adjuntos de un work item, en orden de subida. El binario vive en el bucket
 * `work-item-files`; acá solo van los metadatos + la ruta (ver 019). */
export async function listAttachments(db: Db, workItemId: string): Promise<AttachmentRow[]> {
  const { data, error } = await db
    .from("work_item_attachments")
    .select("*")
    .eq("work_item_id", workItemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function insertAttachment(
  db: Db,
  values: TablesInsert<"work_item_attachments">,
): Promise<AttachmentRow> {
  const { data, error } = await db
    .from("work_item_attachments")
    .insert(values)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getAttachment(db: Db, id: string): Promise<AttachmentRow | null> {
  const { data, error } = await db
    .from("work_item_attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteAttachmentRow(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_attachments").delete().eq("id", id);
  if (error) throw error;
}
