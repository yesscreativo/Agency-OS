"use server";

import { revalidatePath } from "next/cache";
import { getQuoteById, upsertSupplierOrder } from "@agency-os/db";
import { SUPPLIER_TOKEN_EXPIRY_DAYS } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { emitWebhook } from "@/lib/webhooks";

export interface SendSupplierOrderInput {
  supplierName: string;
  supplierEmail: string;
  message: string;
}

/** Envía (o reenvía) la orden de compra a un proveedor con SUS ítems.
 * Solo cuando la cotización está aceptada (paridad renderSupplierOrders del legacy).
 * Persiste la orden y dispara el webhook `supplier_order` a n8n (n8n manda el mail).
 * El flujo público /proveedor (confirmación por token) queda para Fase 6. */
export async function sendSupplierOrder(
  quoteId: string,
  input: SendSupplierOrderInput,
): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote.update")) {
    return { error: "No tienes permiso para enviar órdenes a proveedores." };
  }
  const supplierName = input.supplierName.trim();
  const supplierEmail = input.supplierEmail.trim();
  if (!supplierName) return { error: "Proveedor inválido." };
  if (!supplierEmail) return { error: "Ingresa el email del proveedor." };

  const db = await getSupabaseServerClient();
  try {
    const quote = await getQuoteById(db, quoteId);
    if (!quote) return { error: "La cotización no existe." };
    if (quote.status !== "accepted") {
      return { error: "Solo se envían órdenes cuando la cotización está aceptada." };
    }

    // Ítems de este proveedor (excluye grupos).
    const items = quote.quote_items
      .filter((it) => !it.is_group && (it.supplier ?? "").trim() === supplierName)
      .map((it) => ({
        description: it.description,
        quantity: it.quantity,
        cost_price: it.cost_price,
      }));
    if (items.length === 0) return { error: "Este proveedor no tiene ítems asignados." };

    const expiresAt = new Date(
      Date.now() + SUPPLIER_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const order = await upsertSupplierOrder(db, {
      quoteId,
      supplierName,
      supplierEmail,
      items,
      expiresAt,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await emitWebhook("supplier_order", {
      order_id: order.id,
      quote_id: quoteId,
      code: quote.code,
      supplier: order.supplier_name,
      email: order.supplier_email,
      message: input.message.trim() || null,
      token: order.token,
      supplier_url: `${appUrl}/proveedor?token=${order.token}`,
      currency: quote.currency,
      items,
    });

    revalidatePath(`/crm/${quoteId}`);
    return { ok: true };
  } catch (error) {
    console.error("sendSupplierOrder", error);
    return { error: "No se pudo enviar la orden al proveedor. Intenta de nuevo." };
  }
}
