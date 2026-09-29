import type { Db } from "./shared";

export interface QuotePresenceRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
}

/** Marca que este usuario tiene la cotización abierta AHORA — se llama cada
 * ~12s mientras el formulario está montado (ver syncQuotePresence). Upsert
 * simple: no hace falta borrar al cerrar la pestaña, la fila expira sola
 * (ver ventana de frescura en listQuotePresence + el cron de limpieza en la
 * migración 054_quote_presence.sql). */
export async function upsertQuotePresence(
  db: Db,
  input: { quoteId: string; userId: string; organizationId: string },
): Promise<void> {
  const { error } = await db.from("quote_presence").upsert(
    {
      quote_id: input.quoteId,
      user_id: input.userId,
      organization_id: input.organizationId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "quote_id,user_id" },
  );
  if (error) throw error;
}

/** Quién MÁS (excluyendo `excludingUserId`) tiene esta cotización abierta
 * ahora mismo — "ahora mismo" = un ping en los últimos `freshSeconds`
 * (default 25s: un poco más del doble del intervalo de ping de ~12s, tolera
 * un beat perdido sin que la persona parpadee de la lista). */
export async function listQuotePresence(
  db: Db,
  quoteId: string,
  excludingUserId: string,
  freshSeconds = 25,
): Promise<QuotePresenceRow[]> {
  const since = new Date(Date.now() - freshSeconds * 1000).toISOString();
  const { data, error } = await db
    .from("quote_presence")
    .select("user_id, users!inner(person:people!inner(full_name, avatar_url))")
    .eq("quote_id", quoteId)
    .neq("user_id", excludingUserId)
    .gte("last_seen_at", since);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const person = (
      row.users as unknown as { person: { full_name: string; avatar_url: string | null } }
    ).person;
    const avatarUrl = person.avatar_url
      ? (db.storage.from("user-avatars").getPublicUrl(person.avatar_url).data.publicUrl ?? null)
      : null;
    return { userId: row.user_id, fullName: person.full_name, avatarUrl };
  });
}
