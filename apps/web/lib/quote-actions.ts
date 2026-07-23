"use server";

import { revalidatePath } from "next/cache";
import {
  createQuote,
  createQuoteVersion,
  getQuoteById,
  nextQuoteSeq,
  replaceQuoteItems,
  replaceQuoteRecipients,
  softDeleteQuote,
  updateQuote,
  type TablesUpdate,
} from "@agency-os/db";
import { buildQuoteCode, calcQuote, validateBriefSize, validateQuote } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { emitWebhook } from "@/lib/webhooks";

export interface QuoteItemInput {
  description: string;
  quantity: number;
  clientPrice: number;
  costPrice: number;
  supplier: string;
  isGroup: boolean;
}

export interface QuoteRecipientInput {
  name: string;
  email: string;
}

export interface QuoteDraftInput {
  id?: string;
  clientId: string;
  kamId: string;
  quoteType: "proyecto" | "evolutivo" | "";
  quoteName: string;
  message: string;
  internalNotes: string;
  currency: "COP" | "USD";
  eventDate: string;
  hasIva: boolean;
  ivaPercentage: number;
  items: QuoteItemInput[];
  recipients: QuoteRecipientInput[];
}

export type QuoteSaveResult = { id: string; error?: never } | { id?: never; error: string };

function sanitizeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Guarda (crea o actualiza) el borrador completo: cotización + ítems + destinatarios.
 * Lo usa tanto el botón "Guardar" como el autosave del formulario. */
export async function saveQuoteDraft(input: QuoteDraftInput): Promise<QuoteSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };

  const required = input.id ? "quote.update" : "quote.create";
  if (!hasPermission(user, required)) {
    return { error: "No tienes permiso para guardar cotizaciones." };
  }
  if (!input.clientId) return { error: "Selecciona un cliente." };

  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  const db = await getSupabaseServerClient();

  const values: TablesUpdate<"quotes"> = {
    client_id: input.clientId,
    kam_id: input.kamId || null,
    quote_type: input.quoteType || null,
    quote_name: input.quoteName.trim() || null,
    message: input.message.trim() || null,
    internal_notes: input.internalNotes.trim() || null,
    currency: input.currency === "USD" ? "USD" : "COP",
    event_date: input.eventDate || null,
    has_iva: input.hasIva,
    iva_percentage: input.hasIva ? sanitizeNumber(input.ivaPercentage, 19) : 0,
  };

  try {
    let quoteId = input.id;
    if (quoteId) {
      await updateQuote(db, quoteId, values);
    } else {
      const quote = await createQuote(db, {
        ...values,
        client_id: input.clientId,
        organization_id: organizationId,
        created_by: user.id,
        status: "draft",
      });
      quoteId = quote.id;
    }

    await replaceQuoteItems(
      db,
      quoteId,
      input.items
        .filter((item) => item.description.trim() || item.isGroup)
        .map((item) => ({
          description: item.description.trim(),
          quantity: Math.max(1, Math.round(sanitizeNumber(item.quantity, 1))),
          client_price: sanitizeNumber(item.clientPrice),
          cost_price: sanitizeNumber(item.costPrice),
          supplier: item.supplier.trim() || null,
          is_group: item.isGroup,
        })),
    );

    await replaceQuoteRecipients(
      db,
      quoteId,
      input.recipients
        .filter((r) => r.email.trim())
        .map((r) => ({ name: r.name.trim() || r.email.trim(), email: r.email.trim() })),
    );

    revalidatePath("/crm");
    return { id: quoteId };
  } catch (error) {
    console.error("saveQuoteDraft", error);
    return { error: "No se pudo guardar la cotización. Intenta de nuevo." };
  }
}

export type QuoteSendResult =
  | { id: string; code: string; error?: never }
  | { id?: never; code?: never; error: string };

/** Envía la cotización al cliente: valida, asigna código (consecutivo atómico en BD),
 * guarda snapshot en quote_versions, pasa a `sent` y publica `quote.sent` a n8n. */
export async function sendQuote(quoteId: string): Promise<QuoteSendResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote.update")) {
    return { error: "No tienes permiso para enviar cotizaciones." };
  }

  const db = await getSupabaseServerClient();

  try {
    const quote = await getQuoteById(db, quoteId);
    if (!quote) return { error: "La cotización no existe." };

    const validation = validateQuote({
      items: quote.quote_items,
      recipients: quote.quote_recipients,
      isSending: true,
    });
    if (!validation.valid) return { error: validation.errors.join(". ") };

    // Código solo se asigna la primera vez que se envía; reenvíos lo conservan.
    let code = quote.code;
    if (!code) {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const seq = await nextQuoteSeq(db, quote.client_id, day);
      code = buildQuoteCode({
        clientName: quote.client?.name,
        clientCompany: quote.client?.company,
        date: now,
        seq,
      });
    }

    await createQuoteVersion(
      db,
      quoteId,
      {
        code,
        status: quote.status,
        quote_name: quote.quote_name,
        message: quote.message,
        currency: quote.currency,
        event_date: quote.event_date,
        has_iva: quote.has_iva,
        iva_percentage: quote.iva_percentage,
        client: quote.client ? { id: quote.client.id, name: quote.client.name } : null,
        items: quote.quote_items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          client_price: item.client_price,
          cost_price: item.cost_price,
          supplier: item.supplier,
          is_group: item.is_group,
          sort_order: item.sort_order,
        })),
        recipients: quote.quote_recipients.map((r) => ({ name: r.name, email: r.email })),
      },
      user.id,
    );

    await updateQuote(db, quoteId, {
      code,
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const totals = calcQuote(
      quote.quote_items.map((item) => ({
        clientPrice: item.client_price,
        costPrice: item.cost_price,
        quantity: item.quantity,
        isGroup: item.is_group,
      })),
      { role: "kam", hasIva: quote.has_iva, ivaPercentage: quote.iva_percentage },
    );
    await emitWebhook("quote_sent", {
      quote_id: quoteId,
      code,
      quote_name: quote.quote_name,
      client: quote.client ? { name: quote.client.name, email: quote.client.email } : null,
      currency: quote.currency,
      total: totals.total,
      recipients: quote.quote_recipients.map((r) => ({
        name: r.name,
        email: r.email,
        link: `${appUrl}/respuesta/${r.token}`,
        expires_at: r.expires_at,
      })),
    });

    revalidatePath("/crm");
    revalidatePath(`/crm/${quoteId}`);
    return { id: quoteId, code };
  } catch (error) {
    console.error("sendQuote", error);
    return { error: "No se pudo enviar la cotización. Intenta de nuevo." };
  }
}

/** Cambia el estado de la cotización (selector del formulario / paridad Kanban).
 * Permite mover libremente entre estados del catálogo; NO ejecuta el envío
 * (código/versión/webhook) — eso vive en `sendQuote`. Estampa el timestamp del
 * hito al entrar a accepted/rejected/closed (paridad adminApprove/confirmReject). */
export async function setQuoteStatus(
  quoteId: string,
  statusCode: string,
): Promise<QuoteSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote.update")) {
    return { error: "No tienes permiso para cambiar el estado." };
  }
  if (!statusCode.trim()) return { error: "Estado inválido." };

  const db = await getSupabaseServerClient();
  try {
    const values: TablesUpdate<"quotes"> = { status: statusCode };
    const now = new Date().toISOString();
    if (statusCode === "accepted") values.accepted_at = now;
    else if (statusCode === "rejected") values.rejected_at = now;
    else if (statusCode === "closed") values.closed_at = now;

    await updateQuote(db, quoteId, values);
    revalidatePath("/crm");
    revalidatePath(`/crm/${quoteId}`);
    return { id: quoteId };
  } catch (error) {
    console.error("setQuoteStatus", error);
    return { error: "No se pudo cambiar el estado. Intenta de nuevo." };
  }
}

/** Guarda los documentos comerciales (orden de compra / número de factura).
 * Solo tienen sentido con la cotización aceptada (paridad legacy). */
export async function saveCommercialDocs(
  quoteId: string,
  input: { purchaseOrder: string; invoiceNumber: string },
): Promise<QuoteSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote.update")) {
    return { error: "No tienes permiso para editar documentos comerciales." };
  }

  const db = await getSupabaseServerClient();
  try {
    await updateQuote(db, quoteId, {
      purchase_order: input.purchaseOrder.trim() || null,
      invoice_number: input.invoiceNumber.trim() || null,
    });
    revalidatePath(`/crm/${quoteId}`);
    return { id: quoteId };
  } catch (error) {
    console.error("saveCommercialDocs", error);
    return { error: "No se pudieron guardar los documentos comerciales." };
  }
}

/** Elimina (soft delete) la cotización. La navegación de vuelta a /crm la hace el cliente. */
export async function deleteQuote(quoteId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote.update")) {
    return { error: "No tienes permiso para eliminar cotizaciones." };
  }

  const db = await getSupabaseServerClient();
  try {
    await softDeleteQuote(db, quoteId);
    revalidatePath("/crm");
    return { ok: true };
  } catch (error) {
    console.error("deleteQuote", error);
    return { error: "No se pudo eliminar la cotización." };
  }
}

/** Sube el brief al bucket privado `briefs` y guarda la ruta en la cotización. */
export async function uploadBrief(quoteId: string, formData: FormData): Promise<QuoteSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "quote.update")) {
    return { error: "No tienes permiso para adjuntar archivos." };
  }

  const file = formData.get("brief");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo." };

  const sizeCheck = validateBriefSize(file.size);
  if (!sizeCheck.valid) return { error: "El brief supera el límite de 10 MB." };

  const db = await getSupabaseServerClient();
  const path = `${quoteId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;

  const { error: uploadError } = await db.storage.from("briefs").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) {
    console.error("uploadBrief", uploadError);
    return { error: "No se pudo subir el brief." };
  }

  try {
    await updateQuote(db, quoteId, { brief_url: path });
  } catch (error) {
    console.error("uploadBrief:update", error);
    return { error: "El archivo subió pero no se pudo enlazar a la cotización." };
  }

  revalidatePath(`/crm/${quoteId}`);
  return { id: quoteId };
}
