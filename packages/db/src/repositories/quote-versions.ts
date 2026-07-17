import type { Json, Tables } from "../types/database";
import type { Db } from "./shared";

export async function listQuoteVersions(
  db: Db,
  quoteId: string,
): Promise<Tables<"quote_versions">[]> {
  const { data, error } = await db
    .from("quote_versions")
    .select("*")
    .eq("quote_id", quoteId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Crea el siguiente snapshot de la cotización (version_number consecutivo). */
export async function createQuoteVersion(
  db: Db,
  quoteId: string,
  snapshot: Json,
  createdBy?: string,
) {
  const { data: last, error: lastError } = await db
    .from("quote_versions")
    .select("version_number")
    .eq("quote_id", quoteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const { data, error } = await db
    .from("quote_versions")
    .insert({
      quote_id: quoteId,
      version_number: (last?.version_number ?? 0) + 1,
      snapshot,
      created_by: createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
