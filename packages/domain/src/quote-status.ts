// Extraído de kanban.js (columnas) y submitResponse() en js/respuesta.js del cotizador viejo.

export const QUOTE_STATUSES = [
  "draft",
  "review_future",
  "sent",
  "under_review",
  "modified",
  "accepted",
  "rejected",
  "purchased",
  "closed",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export function isValidQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

/**
 * El Kanban de producción permite mover una cotización a cualquiera de las 9
 * columnas libremente (solo se valida permiso de rol vía canEdit(), no la
 * transición en sí) — se preserva esa paridad a propósito, no se introduce
 * una máquina de estados restrictiva nueva.
 */
export function canTransition(from: string, to: string): boolean {
  return isValidQuoteStatus(from) && isValidQuoteStatus(to);
}

export type QuoteItemResponseStatus = "pending" | "accepted" | "rejected" | "changes";

export function deriveStatusFromClientResponse(
  itemStatuses: QuoteItemResponseStatus[],
): "modified" | "accepted" | "rejected" | "under_review" {
  const anyChanges = itemStatuses.some((s) => s === "changes");
  if (anyChanges) return "modified";

  const allAccepted = itemStatuses.every((s) => s === "accepted");
  if (allAccepted) return "accepted";

  const anyRejected = itemStatuses.some((s) => s === "rejected");
  if (anyRejected) return "rejected";

  return "under_review";
}
