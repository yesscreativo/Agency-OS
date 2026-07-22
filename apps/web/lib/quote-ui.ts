import type { QuoteKpiKey } from "@agency-os/domain";
import type { KpiTone } from "@agency-os/ui";

// Los estados (labels y colores) ya NO viven aquí: son un catálogo administrable
// por organización (tabla quote_statuses). Se leen vía getQuoteStatusMap /
// resolveStatus en `@/lib/quote-status-catalog`. Los defaults de sistema están en
// `SYSTEM_QUOTE_STATUS_SEED` de @agency-os/domain. Aquí solo quedan las KPI cards.

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
