"use server";

import { listQuotePresence, upsertQuotePresence, type QuotePresenceRow } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Marca presencia propia en esta cotización y devuelve quién MÁS la tiene
 * abierta ahora mismo. Se llama cada ~12s desde <QuotePresence> mientras la
 * página está montada. Sin sesión o sin resultado no es un error real para el
 * usuario — es un indicador informativo, se apaga en silencio. */
export async function syncQuotePresence(quoteId: string): Promise<QuotePresenceRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const organizationId = user.organizationIds[0];
  if (!organizationId) return [];

  const db = await getSupabaseServerClient();
  try {
    await upsertQuotePresence(db, { quoteId, userId: user.id, organizationId });
    return await listQuotePresence(db, quoteId, user.id);
  } catch (error) {
    console.error("syncQuotePresence", error);
    return [];
  }
}
