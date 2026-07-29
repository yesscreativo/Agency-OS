import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report } from "./report";
import type { LegacyQuote } from "./legacy-types";

const BUCKET = "briefs";

/** Nombre del objeto dentro del bucket, a partir de la URL pública legacy
 * (`…/object/public/briefs/<obj>`). */
function objectNameFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length).split("?")[0];
  return raw ? decodeURIComponent(raw) : null;
}

/** Copia cada brief del bucket público legacy al bucket privado del destino, en la ruta
 * `<quoteId>/<obj>` (el formato que el app espera para generar signed URLs), y reescribe
 * `quotes.brief_url`. Si la copia falla, deja `brief_url` en null y lo reporta. */
export async function copyBriefs(
  legacy: SupabaseClient,
  agency: SupabaseClient,
  quotes: LegacyQuote[],
  dryRun: boolean,
  report: Report,
): Promise<void> {
  const withBrief = quotes.filter((q) => q.brief_url && q.brief_url.trim());
  for (const q of withBrief) {
    const label = q.quote_code ?? q.id;
    const objectName = objectNameFromUrl(q.brief_url!);
    if (!objectName) {
      report.anomaly(`brief de ${label}: URL no reconocida (${q.brief_url}); brief_url→null`);
      if (!dryRun) await agency.from("quotes").update({ brief_url: null }).eq("id", q.id);
      continue;
    }

    report.bump("briefs");
    if (dryRun) continue;

    const { data: blob, error: dErr } = await legacy.storage.from(BUCKET).download(objectName);
    if (dErr || !blob) {
      report.anomaly(`brief de ${label}: descarga falló (${dErr?.message ?? "vacío"}); brief_url→null`);
      await agency.from("quotes").update({ brief_url: null }).eq("id", q.id);
      continue;
    }

    const newPath = `${q.id}/${objectName}`;
    const { error: uErr } = await agency.storage.from(BUCKET).upload(newPath, blob, {
      contentType: blob.type || "application/octet-stream",
      upsert: true,
    });
    if (uErr) {
      report.anomaly(`brief de ${label}: subida falló (${uErr.message}); brief_url→null`);
      await agency.from("quotes").update({ brief_url: null }).eq("id", q.id);
      continue;
    }

    const { error: updErr } = await agency.from("quotes").update({ brief_url: newPath }).eq("id", q.id);
    if (updErr) report.anomaly(`brief de ${label}: no se pudo enlazar la ruta (${updErr.message})`);
  }
}
