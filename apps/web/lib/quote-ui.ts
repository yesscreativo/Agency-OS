import type { QuoteStatus } from "@agency-os/domain";
import type { BadgeTone } from "@agency-os/ui";

/** Etiquetas en español de los 9 estados (paridad con el cotizador viejo). */
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Borrador",
  review_future: "Revisión futura",
  sent: "Enviada",
  under_review: "En revisión",
  modified: "Modificada",
  accepted: "Aceptada",
  rejected: "Rechazada",
  purchased: "Comprada",
  closed: "Cerrada",
};

export const QUOTE_STATUS_TONES: Record<QuoteStatus, BadgeTone> = {
  draft: "neutral",
  review_future: "neutral",
  sent: "info",
  under_review: "info",
  modified: "info",
  accepted: "success",
  rejected: "danger",
  purchased: "success",
  closed: "neutral",
};
