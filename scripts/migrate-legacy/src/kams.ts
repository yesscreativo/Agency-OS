import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report } from "./report";
import type { LegacyKamPm, LegacyQuote } from "./legacy-types";
import { upsertRows } from "./db-helpers";

/** Crea en destino las KAM/PM referenciadas (por texto `kam_pm`) por las cotizaciones del
 * piloto, cruzando por nombre con el catálogo legacy `kams_pms` para traer `is_active`.
 * `user_id` queda null: se enlaza a la persona real cuando existan las cuentas.
 * Idempotente: reusa las KAM que ya existen en destino por nombre (no duplica al re-correr).
 * Devuelve un mapa nombre(lower) → kam id para setear `quotes.kam_id`. */
export async function resolveKams(
  legacy: SupabaseClient,
  agency: SupabaseClient,
  orgId: string,
  quotes: LegacyQuote[],
  dryRun: boolean,
  report: Report,
): Promise<Map<string, string>> {
  const names = [...new Set(quotes.map((q) => q.kam_pm?.trim()).filter((n): n is string => !!n))];
  const map = new Map<string, string>();
  if (names.length === 0) return map;

  const { data: kamsPms, error: kpErr } = await legacy.from("kams_pms").select("id,name,active");
  if (kpErr) throw new Error(`Leyendo kams_pms: ${kpErr.message}`);
  const legacyByName = new Map<string, LegacyKamPm>();
  for (const k of (kamsPms ?? []) as LegacyKamPm[]) legacyByName.set(k.name.trim().toLowerCase(), k);

  const { data: existing, error: exErr } = await agency
    .from("kams")
    .select("id,name")
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  if (exErr) throw new Error(`Leyendo kams destino: ${exErr.message}`);
  const existingByName = new Map<string, string>();
  for (const k of (existing ?? []) as { id: string; name: string }[]) {
    existingByName.set(k.name.trim().toLowerCase(), k.id);
  }

  const toInsert: Record<string, unknown>[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const already = existingByName.get(lower);
    if (already) {
      map.set(lower, already);
      continue;
    }
    const matched = legacyByName.get(lower);
    if (!matched) report.anomaly(`kam_pm "${name}" sin match en kams_pms → creada is_active=true`);
    const id = matched?.id ?? randomUUID();
    toInsert.push({
      id,
      organization_id: orgId,
      name,
      is_active: matched?.active ?? true,
      user_id: null,
    });
    map.set(lower, id);
  }

  await upsertRows(agency, "kams", toInsert, dryRun, report);
  return map;
}
