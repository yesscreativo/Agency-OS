import { deriveStatusFromClientResponse } from "@agency-os/domain";
import type { BadgeTone } from "@agency-os/ui";

/** Estado de la respuesta del cliente por ítem (enum quote_item_status). */
export type QuoteItemStatus = "pending" | "accepted" | "rejected" | "changes";

export interface ItemStatusMeta {
  label: string;
  /** Tono semántico del Badge; se ignora si se pasa `color`. */
  tone?: BadgeTone;
  /** Color hex (para "changes", que no tiene tono ámbar propio). */
  color?: string;
}

export const QUOTE_ITEM_STATUS_META: Record<QuoteItemStatus, ItemStatusMeta> = {
  accepted: { label: "Aceptado", tone: "success" },
  changes: { label: "Pide cambios", color: "#f5c95a" },
  rejected: { label: "Rechazado", tone: "danger" },
  pending: { label: "Sin responder", tone: "neutral" },
};

/** Resumen general de la respuesta del cliente (pill de la sección). Devuelve null
 * si nadie respondió todavía (todos pending). Reutiliza la misma derivación que el
 * flujo público para mantener coherencia con el estado de la cotización. */
export function summarizeClientResponse(
  statuses: QuoteItemStatus[],
): ItemStatusMeta | null {
  if (statuses.length === 0 || statuses.every((s) => s === "pending")) return null;
  switch (deriveStatusFromClientResponse(statuses)) {
    case "accepted":
      return { label: "Todo aceptado", tone: "success" };
    case "modified":
      return { label: "Con cambios", color: "#f5c95a" };
    case "rejected":
      return { label: "Rechazada", tone: "danger" };
    default:
      return { label: "En revisión", tone: "info" };
  }
}
