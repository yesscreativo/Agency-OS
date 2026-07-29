"use server";

import { revalidatePath } from "next/cache";
import {
  confirmSupplierOrder,
  createNotifications,
  createSupabaseServiceRoleClient,
  getQuoteById,
  getRecipientByToken,
  getSupplierOrderByToken,
  resolveQuoteNotifyUserIds,
  saveRecipientResponse,
  setQuoteItemResponses,
  updateQuote,
  type QuoteItemResponse,
  type TablesUpdate,
} from "@agency-os/db";
import { deriveStatusFromClientResponse, isTokenExpired } from "@agency-os/domain";
import { emitWebhook } from "@/lib/webhooks";

// Estas acciones NO usan sesión: son el punto de escritura de las vistas públicas por
// magic link. Reciben el TOKEN (no un id) y re-resuelven todo server-side con el cliente
// service_role (bypassa RLS) — nunca se confía en datos del navegador salvo el propio
// token, que es aleatorio de 32 bytes (imposible de adivinar).

export type PublicItemChoice = "accepted" | "rejected" | "changes";

export interface ClientResponseInput {
  items: { id: string; status: PublicItemChoice; comment: string }[];
  generalComment: string;
}

export type ClientResponseResult =
  | { ok: true; status: "modified" | "accepted" | "rejected" | "under_review" }
  | { ok?: never; error: string };

const CLIENT_CHOICES: ReadonlySet<string> = new Set(["accepted", "rejected", "changes"]);

/** Registra la respuesta del cliente (aceptar/rechazar/pedir cambios por ítem),
 * deriva el estado de la cotización y notifica a n8n. */
export async function submitClientResponse(
  token: string,
  input: ClientResponseInput,
): Promise<ClientResponseResult> {
  const db = createSupabaseServiceRoleClient();
  try {
    const recipient = await getRecipientByToken(db, token);
    if (!recipient) return { error: "Enlace inválido o inexistente." };
    if (isTokenExpired(recipient.expires_at)) {
      return { error: "El enlace ha expirado. Solicita uno nuevo a tu asesor." };
    }

    const quote = await getQuoteById(db, recipient.quote_id);
    if (!quote) return { error: "La cotización ya no está disponible." };

    // Solo ítems reales (no grupos) de ESTA cotización; la elección del cliente se
    // toma del input pero validada contra los ids/estados permitidos.
    const choiceById = new Map(input.items.map((i) => [i.id, i]));
    const responses: QuoteItemResponse[] = quote.quote_items
      .filter((it) => !it.is_group)
      .map((it) => {
        const choice = choiceById.get(it.id);
        const status =
          choice && CLIENT_CHOICES.has(choice.status) ? choice.status : "accepted";
        const comment = choice?.comment?.trim() || null;
        return { id: it.id, status, client_comment: comment };
      });

    await setQuoteItemResponses(db, responses);

    const derived = deriveStatusFromClientResponse(responses.map((r) => r.status));

    const values: TablesUpdate<"quotes"> = { status: derived };
    const now = new Date().toISOString();
    if (derived === "accepted") values.accepted_at = now;
    else if (derived === "rejected") values.rejected_at = now;
    await updateQuote(db, quote.id, values);

    await saveRecipientResponse(db, recipient.id, {
      client_comment: input.generalComment.trim() || null,
    });

    // Notificación en plataforma para quien envió + KAM vinculado.
    try {
      const notifyIds = await resolveQuoteNotifyUserIds(db, quote);
      const verbo = { modified: "pidió cambios en", accepted: "aceptó", rejected: "rechazó", under_review: "revisó" }[derived];
      await createNotifications(
        db,
        notifyIds.map((uid) => ({
          organization_id: quote.organization_id,
          user_id: uid,
          type: "client_response",
          quote_id: quote.id,
          title: `${quote.client?.name ?? "El cliente"} respondió ${quote.code ?? "la cotización"}`,
          body: `El cliente ${verbo} la cotización.`,
        })),
      );
    } catch (notifyError) {
      console.error("submitClientResponse:notify", notifyError);
    }

    await emitWebhook("quote_client_response", {
      quote_id: quote.id,
      code: quote.code,
      derived_status: derived,
      client: quote.client ? { name: quote.client.name, email: quote.client.email } : null,
      general_comment: input.generalComment.trim() || null,
      item_responses: responses.map((r) => ({
        item_id: r.id,
        status: r.status,
        comment: r.client_comment,
      })),
    });

    revalidatePath("/crm");
    revalidatePath(`/crm/${quote.id}`);
    return { ok: true, status: derived };
  } catch (error) {
    console.error("submitClientResponse", error);
    return { error: "No se pudo registrar tu respuesta. Intenta de nuevo." };
  }
}

export type SupplierConfirmResult = { ok: true } | { ok?: never; error: string };

/** Confirma la recepción de la orden por parte del proveedor y notifica a n8n. */
export async function confirmSupplierReception(
  token: string,
  input: { comment: string },
): Promise<SupplierConfirmResult> {
  const db = createSupabaseServiceRoleClient();
  try {
    const order = await getSupplierOrderByToken(db, token);
    if (!order) return { error: "Enlace inválido o inexistente." };
    if (isTokenExpired(order.expires_at)) {
      return { error: "El enlace ha expirado. Contacta a Laburu para reenviarlo." };
    }
    if (order.status === "confirmed") return { ok: true };

    await confirmSupplierOrder(db, order.id, {
      supplier_comment: input.comment.trim() || null,
    });

    const quote = await getQuoteById(db, order.quote_id);

    // Notificación en plataforma para quien envió + KAM vinculado.
    if (quote) {
      try {
        const notifyIds = await resolveQuoteNotifyUserIds(db, quote);
        await createNotifications(
          db,
          notifyIds.map((uid) => ({
            organization_id: quote.organization_id,
            user_id: uid,
            type: "supplier_confirmed",
            quote_id: quote.id,
            title: `${order.supplier_name} confirmó su orden`,
            body: `Cotización ${quote.code ?? ""}`.trim(),
          })),
        );
      } catch (notifyError) {
        console.error("confirmSupplierReception:notify", notifyError);
      }
    }

    await emitWebhook("supplier_confirmed", {
      order_id: order.id,
      quote_id: order.quote_id,
      code: quote?.code ?? null,
      supplier: order.supplier_name,
      comment: input.comment.trim() || null,
    });

    revalidatePath(`/crm/${order.quote_id}`);
    return { ok: true };
  } catch (error) {
    console.error("confirmSupplierReception", error);
    return { error: "No se pudo confirmar la recepción. Intenta de nuevo." };
  }
}
