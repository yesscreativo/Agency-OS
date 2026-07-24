import type { Json, Tables } from "../types/database";
import type { Db } from "./shared";

/** Órdenes a proveedores de una cotización (una por proveedor, clave única
 * (quote_id, supplier_name)). */
export async function listSupplierOrders(
  db: Db,
  quoteId: string,
): Promise<Tables<"supplier_orders">[]> {
  const { data, error } = await db
    .from("supplier_orders")
    .select("*")
    .eq("quote_id", quoteId)
    .order("supplier_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface UpsertSupplierOrderInput {
  quoteId: string;
  supplierName: string;
  supplierEmail: string;
  /** Snapshot de los ítems del proveedor (descripción, cantidad, costo). */
  items: Json;
  /** ISO date; se recalcula en cada envío para renovar la expiración de 30 días. */
  expiresAt: string;
}

/** Crea o actualiza la orden del proveedor y la marca como enviada (status='sent').
 * El `token` lo genera la BD por default; en re-envíos se conserva. */
export async function upsertSupplierOrder(db: Db, input: UpsertSupplierOrderInput) {
  const { data, error } = await db
    .from("supplier_orders")
    .upsert(
      {
        quote_id: input.quoteId,
        supplier_name: input.supplierName,
        supplier_email: input.supplierEmail,
        items: input.items,
        status: "sent",
        sent_at: new Date().toISOString(),
        expires_at: input.expiresAt,
      },
      { onConflict: "quote_id,supplier_name" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Busca la orden por su token de enlace público (vista `/proveedor`). Se resuelve
 * server-side con el cliente service_role (bypassa RLS). */
export async function getSupplierOrderByToken(
  db: Db,
  token: string,
): Promise<Tables<"supplier_orders"> | null> {
  const { data, error } = await db
    .from("supplier_orders")
    .select("*")
    .eq("token", token)
    .maybeSingle<Tables<"supplier_orders">>();
  if (error) throw error;
  return data;
}

/** Marca la orden como confirmada por el proveedor (status='confirmed'). */
export async function confirmSupplierOrder(
  db: Db,
  id: string,
  input: { supplier_comment: string | null },
) {
  const { data, error } = await db
    .from("supplier_orders")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      supplier_comment: input.supplier_comment,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
