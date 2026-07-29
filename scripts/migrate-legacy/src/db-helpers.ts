import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report } from "./report";

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Lee todas las filas de `table` donde `col` ∈ ids. Trocea los ids (evita URLs enormes)
 * y pagina cada lote de a 1000 (límite por defecto de PostgREST). Reutilizable en la
 * migración final (miles de ítems). */
export async function fetchByIds<T>(
  client: SupabaseClient,
  table: string,
  col: string,
  ids: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (const idBatch of chunk(ids, 200)) {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .in(col, idBatch)
        .range(from, from + page - 1);
      if (error) throw new Error(`Leyendo ${table}: ${error.message}`);
      const batch = (data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < page) break;
      from += page;
    }
  }
  return rows;
}

/** Upsert idempotente por `id`, en lotes. Respeta dry-run (solo cuenta). */
export async function upsertRows(
  agency: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  dryRun: boolean,
  report: Report,
): Promise<void> {
  report.bump(table, rows.length);
  if (dryRun || rows.length === 0) return;
  for (const batch of chunk(rows, 500)) {
    const { error } = await agency.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Upsert en ${table}: ${error.message}`);
  }
}
