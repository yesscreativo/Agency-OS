import { formatMoney, QUOTE_KPI_KEYS, summarizeQuoteKpis } from "@agency-os/domain";
import { KpiCard, KpiDot } from "@agency-os/ui";
import { QUOTE_KPI_LABELS, QUOTE_KPI_TONES } from "@/lib/quote-ui";
import { QUOTE_KPI_ICONS } from "@/components/crm/kpi-icons";

/** Fila de 6 KpiCards (Total/Enviadas/Aceptadas/En revisión/Rechazadas/Cerradas)
 * con importes por moneda. Compartida por la lista y el Kanban. */
export function QuoteKpiRow({
  kpis,
  includeClosed,
}: {
  kpis: ReturnType<typeof summarizeQuoteKpis>;
  includeClosed: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {QUOTE_KPI_KEYS.map((key) => {
        const tone = QUOTE_KPI_TONES[key];
        // Una línea por moneda (COP y USD individualizados); si no hay importe, "$ 0".
        const currencies = Object.entries(kpis[key].amounts);
        const lines = currencies.length > 0 ? currencies : [["COP", 0] as [string, number]];
        return (
          <KpiCard
            key={key}
            label={QUOTE_KPI_LABELS[key]}
            value={kpis[key].count}
            hint={key === "total" ? (includeClosed ? "Incluye cerradas" : "Excluye cerradas") : undefined}
            icon={QUOTE_KPI_ICONS[key]}
            tone={tone}
            highlight={key === "total"}
            sub={lines.map(([currency, amount]) => (
              <div key={currency} className="flex items-center gap-2">
                <KpiDot tone={tone} />
                <span className="truncate font-mono text-[13px] text-muted">
                  {formatMoney(amount, currency)}
                </span>
              </div>
            ))}
          />
        );
      })}
    </div>
  );
}
