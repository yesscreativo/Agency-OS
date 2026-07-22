import "server-only";
import { listQuoteStatuses, type Db } from "@agency-os/db";

/** Metadatos de presentación de un estado del pipeline, listos para el Badge. */
export interface QuoteStatusMeta {
  code: string;
  label: string;
  color: string;
  variant: "soft" | "solid";
  onColor?: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  kind: string;
}

export type QuoteStatusMap = Record<string, QuoteStatusMeta>;

/** Carga el catálogo de estados de la organización (vía RLS) indexado por code. */
export async function getQuoteStatusMap(db: Db): Promise<QuoteStatusMap> {
  const rows = await listQuoteStatuses(db);
  const map: QuoteStatusMap = {};
  for (const r of rows) {
    map[r.code] = {
      code: r.code,
      label: r.label,
      color: r.color,
      variant: r.is_solid ? "solid" : "soft",
      onColor: r.on_color ?? undefined,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      isSystem: r.is_system,
      kind: r.kind,
    };
  }
  return map;
}

function prettify(code: string): string {
  const s = code.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Devuelve el meta de un code; si no está en el catálogo (estado borrado/renombrado
 * que quedó guardado en una cotización o snapshot viejo), devuelve un meta neutral
 * legible — nunca falla ni deja el estado en blanco. */
export function resolveStatus(map: QuoteStatusMap, code: string): QuoteStatusMeta {
  return (
    map[code] ?? {
      code,
      label: prettify(code),
      color: "#9aa1ab",
      variant: "soft",
      sortOrder: 999,
      isActive: false,
      isSystem: false,
      kind: "open",
    }
  );
}

/** Estados activos ordenados, para poblar selects de filtro/formulario. */
export function statusOptions(map: QuoteStatusMap): { code: string; label: string }[] {
  return Object.values(map)
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({ code: m.code, label: m.label }));
}
