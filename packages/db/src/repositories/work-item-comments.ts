import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type CommentRow = Tables<"work_item_comments">;

/** Autor embebido para render (nombre + email desde la fila people). */
export interface CommentAuthor {
  id: string;
  full_name: string;
  email: string | null;
}

export type CommentWithAuthor = CommentRow & { author: CommentAuthor | null };

const COMMENT_SELECT =
  "*, author:users!work_item_comments_author_user_id_fkey(id, person:people(full_name, email))";

// La query embebe people dentro de users; lo aplanamos a { id, full_name, email }.
type CommentSelectRow = CommentRow & {
  author: { id: string; person: { full_name: string; email: string | null } | null } | null;
};

function toComment(row: CommentSelectRow): CommentWithAuthor {
  return {
    ...row,
    author: row.author
      ? {
          id: row.author.id,
          full_name: row.author.person?.full_name ?? "—",
          email: row.author.person?.email ?? null,
        }
      : null,
  };
}

/** Comentarios no borrados de un work item, con autor, en orden cronológico. La
 * UI arma el árbol raíz→replies en memoria a partir de `parent_comment_id`. */
export async function listComments(db: Db, workItemId: string): Promise<CommentWithAuthor[]> {
  const { data, error } = await db
    .from("work_item_comments")
    .select(COMMENT_SELECT)
    .eq("work_item_id", workItemId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .returns<CommentSelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toComment);
}

export async function insertComment(
  db: Db,
  values: TablesInsert<"work_item_comments">,
): Promise<CommentWithAuthor> {
  const { data, error } = await db
    .from("work_item_comments")
    .insert(values)
    .select(COMMENT_SELECT)
    .returns<CommentSelectRow[]>()
    .single();
  if (error) throw error;
  return toComment(data);
}

/** Devuelve el comentario crudo (sin autor) para verificar autoría/pertenencia. */
export async function getComment(db: Db, id: string): Promise<CommentRow | null> {
  const { data, error } = await db
    .from("work_item_comments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Edita el cuerpo y sella `edited_at` (auditoría blanda). */
export async function updateCommentBody(db: Db, id: string, body: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from("work_item_comments")
    .update({ body, edited_at: now, updated_at: now })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteComment(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("work_item_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
