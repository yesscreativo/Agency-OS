import { redirect } from "next/navigation";
import { calcQuote, formatDate, formatMoney, isValidQuoteStatus } from "@agency-os/domain";
import { listQuotes, type QuoteListRow, type QuoteStatusDb } from "@agency-os/db";
import { Avatar, Badge, Table, Td, Th } from "@agency-os/ui";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_TONES } from "@/lib/quote-ui";
import { QuoteFilters } from "@/components/crm/quote-filters";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  cerradas?: string;
  pagina?: string;
}

function quoteTotal(row: QuoteListRow): number {
  return calcQuote(
    row.quote_items.map((item) => ({
      clientPrice: item.client_price,
      costPrice: item.cost_price,
      quantity: item.quantity,
      isGroup: item.is_group,
    })),
    { role: "kam", hasIva: row.has_iva, ivaPercentage: row.iva_percentage },
  ).total;
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
  if (params.estado) sp.set("estado", params.estado);
  if (params.desde) sp.set("desde", params.desde);
  if (params.hasta) sp.set("hasta", params.hasta);
  if (params.cerradas) sp.set("cerradas", params.cerradas);
  if (page > 1) sp.set("pagina", String(page));
  const qs = sp.toString();
  return qs ? `/crm?${qs}` : "/crm";
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
  const { rows, total, page, pageSize } = await listQuotes(db, {
    search: searchParams.q,
    status,
    dateFrom: searchParams.desde,
    dateTo: searchParams.hasta,
    includeClosed: searchParams.cerradas === "1",
    page: Number(searchParams.pagina) || 1,
    pageSize: 20,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(searchParams.q || status || searchParams.desde || searchParams.hasta);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="mt-1 text-sm text-muted">
            {total} {total === 1 ? "cotización" : "cotizaciones"}
            {hasFilters ? " con los filtros aplicados" : " activas"}
          </p>
        </div>
        <a
          href="/crm/nueva"
          className="rounded-pill bg-green px-[22px] py-[11px] text-sm font-semibold text-green-ink transition hover:brightness-105"
        >
          + Nueva cotización
        </a>
      </div>

      <div className="mt-6">
        <QuoteFilters
          q={searchParams.q ?? ""}
          estado={status ?? ""}
          desde={searchParams.desde ?? ""}
          hasta={searchParams.hasta ?? ""}
          cerradas={searchParams.cerradas === "1"}
        />
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-8 py-16 text-center">
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
                <Th>Código</Th>
                <Th>Cliente</Th>
                <Th>Nombre</Th>
                <Th>Estado</Th>
                <Th>Fecha</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-surface-2">
                  <Td>
                    <a
                      href={`/crm/${row.id}`}
                      className="font-mono text-[13px] font-bold text-ink hover:text-green"
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
                        <div className="text-sm font-semibold">{row.client?.name ?? "—"}</div>
                        {row.client?.company && (
                          <div className="text-xs text-muted">{row.client.company}</div>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td className="max-w-[26ch] truncate text-muted">{row.quote_name ?? "—"}</Td>
                  <Td>
                    <Badge tone={QUOTE_STATUS_TONES[row.status]}>
                      {QUOTE_STATUS_LABELS[row.status]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(row.created_at)}</Td>
                  <Td className="whitespace-nowrap text-right font-mono text-sm font-bold">
                    {formatMoney(quoteTotal(row), row.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-muted">
          <div>
            Página {page} de {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={pageHref(searchParams, page - 1)}
                className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
              >
                ← Anterior
              </a>
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
        </div>
      )}
    </div>
  );
}
