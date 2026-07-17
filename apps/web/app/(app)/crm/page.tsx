import { redirect } from "next/navigation";
import {
  calcQuote,
  formatDate,
  formatMoney,
  isValidQuoteStatus,
  summarizeQuoteKpis,
  QUOTE_KPI_KEYS,
  type QuoteCalcResult,
} from "@agency-os/domain";
import {
  listKams,
  listQuotes,
  listQuoteStatsRows,
  type QuoteListRow,
  type QuoteStatusDb,
} from "@agency-os/db";
import { Avatar, Badge, KpiCard, KpiDot, Table, Td, Th } from "@agency-os/ui";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  QUOTE_KPI_LABELS,
  QUOTE_KPI_TONES,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
} from "@/lib/quote-ui";
import { QuoteFilters } from "@/components/crm/quote-filters";
import { QUOTE_KPI_ICONS } from "@/components/crm/kpi-icons";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  kam?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  cerradas?: string;
  pagina?: string;
}

function quoteCalc(row: QuoteListRow): QuoteCalcResult {
  return calcQuote(
    row.quote_items.map((item) => ({
      clientPrice: item.client_price,
      costPrice: item.cost_price,
      quantity: item.quantity,
      isGroup: item.is_group,
    })),
    { role: "kam", hasIva: row.has_iva, ivaPercentage: row.iva_percentage },
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function pageHref(params: SearchParams, page: number) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.kam) sp.set("kam", params.kam);
  if (params.estado) sp.set("estado", params.estado);
  if (params.desde) sp.set("desde", params.desde);
  if (params.hasta) sp.set("hasta", params.hasta);
  if (params.cerradas) sp.set("cerradas", params.cerradas);
  if (page > 1) sp.set("pagina", String(page));
  const qs = sp.toString();
  return qs ? `/crm?${qs}` : "/crm";
}

/** Números de página a mostrar: primera, última y vecinas de la actual, con "gap" como elipsis. */
function buildPageItems(current: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, current - 1, current, current + 1]);
  const items: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (wanted.has(p)) items.push(p);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }
  return items;
}

export default async function QuotesListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const status =
    searchParams.estado && isValidQuoteStatus(searchParams.estado)
      ? (searchParams.estado as QuoteStatusDb)
      : undefined;

  const db = await getSupabaseServerClient();
  const [{ rows, total, page, pageSize }, statsRows, kams] = await Promise.all([
    listQuotes(db, {
      search: searchParams.q,
      status,
      dateFrom: searchParams.desde,
      dateTo: searchParams.hasta,
      includeClosed: searchParams.cerradas === "1",
      kamId: searchParams.kam || undefined,
      page: Number(searchParams.pagina) || 1,
      pageSize: 20,
    }),
    listQuoteStatsRows(db),
    listKams(db, { onlyActive: true }),
  ]);

  // KPIs globales (todas las cotizaciones no borradas), no responden a los filtros.
  const kpis = summarizeQuoteKpis(
    statsRows.map((r) => ({
      status: r.status,
      currency: r.currency,
      hasIva: r.has_iva,
      ivaPercentage: r.iva_percentage,
      items: r.quote_items.map((i) => ({
        clientPrice: i.client_price,
        costPrice: i.cost_price,
        quantity: i.quantity,
        isGroup: i.is_group,
      })),
    })),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(
    searchParams.q || searchParams.kam || status || searchParams.desde || searchParams.hasta,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="mt-1 text-sm text-muted">
            Crea y gestiona todas las cotizaciones de la agencia
          </p>
        </div>
        <a
          href="/crm/nueva"
          className="rounded-pill bg-green px-[22px] py-[11px] text-sm font-semibold text-green-ink transition hover:brightness-105"
        >
          + Nueva cotización
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
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

      <div className="mt-5">
        <QuoteFilters
          q={searchParams.q ?? ""}
          kam={searchParams.kam ?? ""}
          kams={kams.map((k) => ({ id: k.id, name: k.name }))}
          estado={status ?? ""}
          desde={searchParams.desde ?? ""}
          hasta={searchParams.hasta ?? ""}
          cerradas={searchParams.cerradas === "1"}
        />
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-glass px-8 py-16 text-center backdrop-blur-xl">
            <div className="text-lg font-semibold">
              {hasFilters ? "Sin resultados" : "Todavía no hay cotizaciones"}
            </div>
            <p className="max-w-[44ch] text-sm text-muted">
              {hasFilters
                ? "Ninguna cotización coincide con los filtros. Ajusta la búsqueda o límpialos."
                : "Crea la primera cotización para empezar a trabajar con el CRM."}
            </p>
            {hasFilters ? (
              <a href="/crm" className="text-sm font-semibold text-green hover:underline">
                Limpiar filtros
              </a>
            ) : (
              <a
                href="/crm/nueva"
                className="mt-2 rounded-pill bg-green px-[22px] py-[11px] text-sm font-semibold text-green-ink transition hover:brightness-105"
              >
                + Nueva cotización
              </a>
            )}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Nombre / Cliente</Th>
                <Th>Estado</Th>
                <Th>Moneda</Th>
                <Th className="text-right">Total cliente</Th>
                <Th className="text-right">Margen</Th>
                <Th>Fecha</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const totals = quoteCalc(row);
                return (
                  <tr key={row.id} className="transition hover:bg-surface-2">
                    <Td>
                      <a
                        href={`/crm/${row.id}`}
                        className="whitespace-nowrap font-mono text-[13px] font-bold text-ink hover:text-green"
                      >
                        {row.code ?? "— borrador —"}
                      </a>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar
                          initials={initialsOf(row.client?.name ?? "?")}
                          tone="purple-strong"
                          size="sm"
                        />
                        <div>
                          <div className="max-w-[32ch] truncate text-sm font-semibold">
                            {row.quote_name ?? "—"}
                          </div>
                          <div className="max-w-[32ch] truncate text-xs text-muted">
                            {row.client?.name ?? "—"}
                            {row.client?.company ? ` · ${row.client.company}` : ""}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={QUOTE_STATUS_TONES[row.status]}>
                        {QUOTE_STATUS_LABELS[row.status]}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{row.currency}</Td>
                    <Td className="whitespace-nowrap text-right font-mono text-sm font-bold">
                      {formatMoney(totals.total, row.currency)}
                    </Td>
                    {/* TODO(roles): ocultar Margen a quien no tenga quote.see_costs */}
                    <Td
                      className={`whitespace-nowrap text-right font-mono text-sm font-semibold ${
                        totals.margin < 0 ? "text-warn" : "text-green"
                      }`}
                    >
                      {formatMoney(totals.margin, row.currency)}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{formatDate(row.created_at)}</Td>
                    <Td className="text-right">
                      <a
                        href={`/crm/${row.id}`}
                        className="inline-block rounded-pill border border-line-strong px-4 py-1.5 text-xs font-semibold text-ink transition hover:border-green"
                      >
                        Editar
                      </a>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <div className="flex flex-wrap items-center gap-2">
            {buildPageItems(page, totalPages).map((item, i) =>
              item === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-faint">
                  …
                </span>
              ) : item === page ? (
                <span
                  key={item}
                  aria-current="page"
                  className="rounded-pill bg-green px-4 py-2 font-semibold text-green-ink"
                >
                  {item}
                </span>
              ) : (
                <a
                  key={item}
                  href={pageHref(searchParams, item)}
                  className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
                >
                  {item}
                </a>
              ),
            )}
            {page < totalPages && (
              <a
                href={pageHref(searchParams, page + 1)}
                className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
              >
                Siguiente →
              </a>
            )}
          </div>
          <div>
            Página {page} de {totalPages} ({total} total)
          </div>
        </div>
      )}
    </div>
  );
}
