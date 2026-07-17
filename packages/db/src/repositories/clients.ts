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

export async function updateClient(db: Db, id: string, values: TablesUpdate<"clients">) {
  const { data, error } = await db.from("clients").update(values).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
