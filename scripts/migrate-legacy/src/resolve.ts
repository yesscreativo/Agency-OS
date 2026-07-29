import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cli } from "./config";
import { fetchByIds } from "./db-helpers";
import type {
  LegacyClient,
  LegacyItem,
  LegacyQuote,
  LegacyRecipient,
  LegacySupplierOrder,
  LegacyVersion,
} from "./legacy-types";

export interface PilotData {
  clients: LegacyClient[];
  quotes: LegacyQuote[];
  items: LegacyItem[];
  recipients: LegacyRecipient[];
  versions: LegacyVersion[];
  supplierOrders: LegacySupplierOrder[];
}

/** Resuelve el conjunto a migrar desde el legacy. Con `--only-clients` filtra por nombre o
 * empresa (coincidencia exacta, case-insensitive); sin flag = TODOS (migración final). */
export async function resolvePilot(legacy: SupabaseClient, cli: Cli): Promise<PilotData> {
  const { data: allClients, error } = await legacy.from("clients").select("*");
  if (error) throw new Error(`Leyendo clients: ${error.message}`);

  const tokens = new Set(cli.onlyClients.map((t) => t.toLowerCase()));
  const clients = ((allClients ?? []) as LegacyClient[]).filter((c) => {
    if (tokens.size === 0) return true;
    const name = c.name?.trim().toLowerCase();
    const company = c.company?.trim().toLowerCase();
    return (name && tokens.has(name)) || (company != null && tokens.has(company));
  });

  const clientIds = clients.map((c) => c.id);
  const quotes = clientIds.length
    ? await fetchByIds<LegacyQuote>(legacy, "quotes", "client_id", clientIds)
    : [];
  const quoteIds = quotes.map((q) => q.id);

  const [items, recipients, versions, supplierOrders] = quoteIds.length
    ? await Promise.all([
        fetchByIds<LegacyItem>(legacy, "quote_items", "quote_id", quoteIds),
        fetchByIds<LegacyRecipient>(legacy, "quote_recipients", "quote_id", quoteIds),
        fetchByIds<LegacyVersion>(legacy, "quote_versions", "quote_id", quoteIds),
        fetchByIds<LegacySupplierOrder>(legacy, "supplier_orders", "quote_id", quoteIds),
      ])
    : [[], [], [], []];

  return { clients, quotes, items, recipients, versions, supplierOrders };
}
