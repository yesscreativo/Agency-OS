import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

/** Reemplaza los destinatarios del enlace público (mismo patrón que los ítems).
 * Para un destinatario que ya existía (match por email) se CONSERVAN su token,
 * expiración, "visto" y comentario, para no romper el enlace público ni perder la
 * respuesta del cliente al reguardar. Los nuevos usan los defaults de la BD
 * (token aleatorio + expiración a 5 días). */
export async function replaceQuoteRecipients(
  db: Db,
  quoteId: string,
  recipients: Pick<TablesInsert<"quote_recipients">, "name" | "email">[],
) {
  // Snapshot de lo que había, indexado por email, antes de borrar.
  const { data: existing } = await db
    .from("quote_recipients")
    .select("email, token, expires_at, viewed_at, client_comment")
    .eq("quote_id", quoteId);
  const prevByEmail = new Map(
    (existing ?? []).map((r) => [r.email.trim().toLowerCase(), r]),
  );

  const { error: deleteError } = await db
    .from("quote_recipients")
    .delete()
    .eq("quote_id", quoteId);
  if (deleteError) throw deleteError;
  if (recipients.length === 0) return [];

  const rows = recipients.map((r) => {
    const prev = prevByEmail.get(r.email.trim().toLowerCase());
    return prev
      ? {
          ...r,
          quote_id: quoteId,
          token: prev.token,
          expires_at: prev.expires_at,
          viewed_at: prev.viewed_at,
          client_comment: prev.client_comment,
        }
      : { ...r, quote_id: quoteId };
  });

  const { data, error } = await db.from("quote_recipients").insert(rows).select();
  if (error) throw error;
  return data;
}

/** Busca el destinatario por su token de enlace público. Se usa desde la vista
 * pública `/respuesta` con el cliente service_role (bypassa RLS) — el token nunca
 * se expone al cliente anon de Supabase. */
export async function getRecipientByToken(
  db: Db,
  token: string,
): Promise<Tables<"quote_recipients"> | null> {
  const { data, error } = await db
    .from("quote_recipients")
    .select("*")
    .eq("token", token)
    .maybeSingle<Tables<"quote_recipients">>();
  if (error) throw error;
  return data;
}

/** Marca la primera vez que el cliente abre el enlace (no lo sobreescribe en visitas
 * posteriores). */
export async function markRecipientViewed(db: Db, id: string) {
  const { error } = await db
    .from("quote_recipients")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", id)
    .is("viewed_at", null);
  if (error) throw error;
}

/** Guarda el comentario general del cliente al responder. */
export async function saveRecipientResponse(
  db: Db,
  id: string,
  input: { client_comment: string | null },
) {
  const { error } = await db
    .from("quote_recipients")
    .update({ client_comment: input.client_comment })
    .eq("id", id);
  if (error) throw error;
}
