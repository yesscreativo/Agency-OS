import type { QuoteKpiKey, QuoteStatus } from "@agency-os/domain";
import type { BadgeTone, KpiTone } from "@agency-os/ui";

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

/** Etiquetas de las KPI cards de la lista. */
export const QUOTE_KPI_LABELS: Record<QuoteKpiKey, string> = {
  total: "Total",
  sent: "Enviadas",
  accepted: "Aceptadas",
  under_review: "En revisión",
  rejected: "Rechazadas",
  closed: "Cerradas",
};

/** Tono de cada KPI card (icono, dot y highlight). */
export const QUOTE_KPI_TONES: Record<QuoteKpiKey, KpiTone> = {
  total: "purple",
  sent: "purple",
  accepted: "green",
  under_review: "warn",
  rejected: "danger",
  closed: "neutral",
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
