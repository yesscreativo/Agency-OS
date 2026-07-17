import type { TablesInsert } from "../types/database";
import type { Db } from "./shared";

/** Reemplaza los destinatarios del enlace público (mismo patrón que los ítems).
 * El token y la expiración (5 días) los genera la BD por default. */
export async function replaceQuoteRecipients(
  db: Db,
  quoteId: string,
  recipients: Pick<TablesInsert<"quote_recipients">, "name" | "email">[],
) {
  const { error: deleteError } = await db
    .from("quote_recipients")
    .delete()
    .eq("quote_id", quoteId);
  if (deleteError) throw deleteError;
  if (recipients.length === 0) return [];
  const { data, error } = await db
    .from("quote_recipients")
    .insert(recipients.map((r) => ({ ...r, quote_id: quoteId })))
    .select();
  if (error) throw error;
  return data;
}
