import { calcQuote, type QuoteCalcItem } from "./quote-calc";

/** Buckets de las KPI cards de la lista, en su orden de despliegue. */
export const QUOTE_KPI_KEYS = [
  "total",
  "sent",
  "accepted",
  "under_review",
  "rejected",
  "closed",
] as const;

export type QuoteKpiKey = (typeof QUOTE_KPI_KEYS)[number];

const STATUS_BUCKETS = new Set<string>(QUOTE_KPI_KEYS.filter((key) => key !== "total"));

export interface QuoteKpiSource {
  status: string;
  currency: string;
  hasIva: boolean;
  ivaPercentage: number;
  items: QuoteCalcItem[];
}

export interface QuoteKpi {
  count: number;
  /** Suma del total cliente por moneda (COP y USD se acumulan por separado). */
  amounts: Record<string, number>;
}

function addToBucket(bucket: QuoteKpi, currency: string, amount: number) {
  bucket.count++;
  bucket.amounts[currency] = (bucket.amounts[currency] ?? 0) + amount;
}

/** Conteo + suma del total cliente (con IVA, mismo criterio que la columna Total
 * de la lista) por bucket, individualizando el importe por moneda. "total" acumula
 * todas las cotizaciones; los estados sin bucket propio (draft, modified, purchased
 * y los custom) solo cuentan ahí. */
export function summarizeQuoteKpis(
  rows: QuoteKpiSource[],
  role = "kam",
): Record<QuoteKpiKey, QuoteKpi> {
  const kpis = Object.fromEntries(
    QUOTE_KPI_KEYS.map((key) => [key, { count: 0, amounts: {} as Record<string, number> }]),
  ) as Record<QuoteKpiKey, QuoteKpi>;

  for (const row of rows) {
    const { total } = calcQuote(row.items, {
      role,
      hasIva: row.hasIva,
      ivaPercentage: row.ivaPercentage,
    });
    addToBucket(kpis.total, row.currency, total);
    if (STATUS_BUCKETS.has(row.status)) {
      addToBucket(kpis[row.status as QuoteKpiKey], row.currency, total);
    }
  }

  return kpis;
}
