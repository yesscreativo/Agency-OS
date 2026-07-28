import type { Tables, TablesInsert, TablesUpdate } from "../types/database";
import type { Db, Page } from "./shared";

export interface ClientListFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listClients(
  db: Db,
  filters: ClientListFilters = {},
): Promise<Page<Tables<"clients">>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));

  let query = db
    .from("clients")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order("name")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`name.ilike.${term},company.ilike.${term},email.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getClientById(db: Db, id: string) {
  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createClient(db: Db, values: TablesInsert<"clients">) {
  const { data, error } = await db.from("clients").insert(values).select().single();
  if (error) throw error;
  return data;
}

/** Actualiza un cliente. Se exige `organizationId` y se filtra por él para evitar
 * IDOR cross-tenant en la capa de app (además de la RLS `clients_write`). */
export async function updateClient(
  db: Db,
  id: string,
  organizationId: string,
  values: TablesUpdate<"clients">,
) {
  const { data, error } = await db
    .from("clients")
    .update(values)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Baja lógica: el cliente sale de listas y selectores, pero las cotizaciones
 * existentes lo siguen resolviendo (el embed no filtra deleted_at). Se filtra por
 * `organizationId` para evitar IDOR cross-tenant (además de la RLS). */
export async function softDeleteClient(db: Db, id: string, organizationId: string) {
  const { error } = await db
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/** ¿Existe otro cliente (no borrado) con este código en la organización? Se usa
 * para validar unicidad al guardar (case-insensitive). `excludeId` omite el propio. */
export async function clientCodeExists(
  db: Db,
  organizationId: string,
  code: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("code", code);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export type ClientQuoteRow = Pick<
  Tables<"quotes">,
  "id" | "code" | "quote_name" | "status" | "currency" | "has_iva" | "iva_percentage" | "created_at"
> & {
  quote_items: Pick<
    Tables<"quote_items">,
    "client_price" | "cost_price" | "quantity" | "is_group"
  >[];
};

/** Cotizaciones de un cliente (historial de la ficha), con lo justo para calcular
 * totales en app con calcQuote. Incluye cerradas; ordena por fecha desc. */
export async function listClientQuotes(db: Db, clientId: string): Promise<ClientQuoteRow[]> {
  const { data, error } = await db
    .from("quotes")
    .select(
      "id, code, quote_name, status, currency, has_iva, iva_percentage, created_at, quote_items(client_price, cost_price, quantity, is_group)",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<ClientQuoteRow[]>();
  if (error) throw error;
  return data ?? [];
}

/** Nº de cotizaciones no borradas por cliente (para la columna de la lista).
 * Data pequeña: trae los client_id del conjunto y cuenta en memoria. */
export async function countQuotesByClient(
  db: Db,
  clientIds: string[],
): Promise<Record<string, number>> {
  if (clientIds.length === 0) return {};
  const { data, error } = await db
    .from("quotes")
    .select("client_id")
    .is("deleted_at", null)
    .in("client_id", clientIds);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { client_id: string | null }).client_id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
