import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report } from "./report";
import type { PilotData } from "./resolve";
import { chunk } from "./db-helpers";

/** Deshace en destino lo que migró el piloto: filas (orden inverso de FKs) + objetos de
 * Storage + KAM creadas que queden sin usar. Se apoya en los UUID legacy preservados. */
export async function rollback(
  agency: SupabaseClient,
  orgId: string,
  data: PilotData,
  report: Report,
): Promise<void> {
  const quoteIds = data.quotes.map((q) => q.id);
  const clientIds = data.clients.map((c) => c.id);

  const delByQuote = async (table: string) => {
    let n = 0;
    for (const ids of chunk(quoteIds, 200)) {
      const { data: del, error } = await agency.from(table).delete().in("quote_id", ids).select("id");
      if (error) throw new Error(`Borrando ${table}: ${error.message}`);
      n += del?.length ?? 0;
    }
    report.bump(`${table} (borrados)`, n);
  };

  if (quoteIds.length) {
    for (const t of ["supplier_orders", "quote_versions", "quote_recipients", "quote_items"]) {
      await delByQuote(t);
    }
    // Objetos de Storage bajo <quoteId>/
    for (const qid of quoteIds) {
      const { data: files } = await agency.storage.from("briefs").list(qid);
      if (files && files.length) {
        await agency.storage.from("briefs").remove(files.map((f) => `${qid}/${f.name}`));
        report.bump("briefs (borrados)", files.length);
      }
    }
    for (const ids of chunk(quoteIds, 200)) {
      const { data: del, error } = await agency.from("quotes").delete().in("id", ids).select("id");
      if (error) throw new Error(`Borrando quotes: ${error.message}`);
      report.bump("quotes (borrados)", del?.length ?? 0);
    }
  }

  if (clientIds.length) {
    for (const ids of chunk(clientIds, 200)) {
      const { data: del, error } = await agency.from("clients").delete().in("id", ids).select("id");
      if (error) throw new Error(`Borrando clients: ${error.message}`);
      report.bump("clients (borrados)", del?.length ?? 0);
    }
  }

  // KAM referenciadas por el piloto que ya no las use ninguna cotización (y sin usuario).
  const kamNames = [...new Set(data.quotes.map((q) => q.kam_pm?.trim()).filter((n): n is string => !!n))];
  for (const name of kamNames) {
    const { data: kam } = await agency
      .from("kams")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", name)
      .is("user_id", null)
      .maybeSingle();
    if (!kam) continue;
    const { count } = await agency
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("kam_id", (kam as { id: string }).id);
    if ((count ?? 0) === 0) {
      await agency.from("kams").delete().eq("id", (kam as { id: string }).id);
      report.bump("kams (borrados)", 1);
    }
  }
}
