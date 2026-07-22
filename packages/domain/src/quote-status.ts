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

/** `kind` de sistema al que se ancla la automatización (no al label editable).
 * Los estados custom entran como 'open'. */
export type QuoteStatusKind =
  | "draft"
  | "open"
  | "sent"
  | "in_review"
  | "won"
  | "lost"
  | "closed";

export interface QuoteStatusSeed {
  code: QuoteStatus;
  label: string;
  color: string;
  isSolid: boolean;
  /** Override del color de texto en variante sólida (si no, se calcula). */
  onColor?: string;
  kind: QuoteStatusKind;
  sortOrder: number;
}

/** Semilla de los 9 estados de sistema. Espeja 1:1 el seed SQL de la migración
 * `012_quote_status_catalog.sql` (seed_default_quote_statuses). Sirve de fallback
 * en la app cuando el catálogo no está disponible y de fuente para el test de
 * paridad con `QUOTE_STATUSES`. Si cambia el seed SQL, actualizar aquí también. */
export const SYSTEM_QUOTE_STATUS_SEED: readonly QuoteStatusSeed[] = [
  { code: "draft", label: "Borrador", color: "#9aa1ab", isSolid: false, kind: "draft", sortOrder: 10 },
  { code: "review_future", label: "Revisión a futuro", color: "#9aa1ab", isSolid: false, kind: "open", sortOrder: 20 },
  { code: "sent", label: "Enviada", color: "#7eb8ff", isSolid: false, kind: "sent", sortOrder: 30 },
  { code: "under_review", label: "En revisión", color: "#f5c95a", isSolid: false, kind: "in_review", sortOrder: 40 },
  { code: "modified", label: "Modificada", color: "#8b5cf6", isSolid: false, kind: "in_review", sortOrder: 50 },
  { code: "accepted", label: "Aceptada", color: "#86c99a", isSolid: false, kind: "won", sortOrder: 60 },
  { code: "rejected", label: "Rechazada", color: "#e5675f", isSolid: false, kind: "lost", sortOrder: 70 },
  { code: "purchased", label: "Contrato firmado", color: "#3bc9c9", isSolid: false, kind: "won", sortOrder: 80 },
  { code: "closed", label: "Cerrada", color: "#1f8f4d", isSolid: true, onColor: "#ffffff", kind: "closed", sortOrder: 90 },
] as const;

/** Comprueba si `value` es uno de los 9 códigos de SISTEMA. Nota: con el catálogo
 * administrable pueden existir códigos custom por organización que este helper NO
 * reconoce — para validar contra el pipeline real de una org, contrasta contra los
 * códigos del catálogo cargado, no contra este helper. */
export function isValidQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

/**
 * El Kanban de producción permite mover una cotización a cualquiera de las
 * columnas libremente (solo se valida permiso de rol vía canEdit(), no la
 * transición en sí) — se preserva esa paridad a propósito, no se introduce
 * una máquina de estados restrictiva nueva.
 *
 * Con estados administrables, `from`/`to` ya no se limitan a los 9 de sistema.
 * Si se pasa `validCodes` (los códigos activos del catálogo de la org), se valida
 * contra ese conjunto; si no, cualquier par de strings no vacíos es válido.
 */
export function canTransition(from: string, to: string, validCodes?: Set<string>): boolean {
  if (validCodes) return validCodes.has(from) && validCodes.has(to);
  return from.length > 0 && to.length > 0;
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
