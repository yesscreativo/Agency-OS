import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { listPipelineQuotes } from "@agency-os/db";
import { calcQuote, formatMoney } from "@agency-os/domain";
import { Badge, KpiCard, KpiDot, Table, Td, Th, type KpiTone } from "@agency-os/ui";
import { getCurrentUser, hasPermission, quoteAccess } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus } from "@/lib/quote-status-catalog";
import { QUOTE_KPI_ICONS } from "@/components/crm/kpi-icons";

export const dynamic = "force-dynamic";

// "Ganada" = misma definición que la ficha de cliente.
const WON_STATUSES = new Set(["accepted", "purchased", "closed"]);

interface SearchParams {
  desde?: string;
  hasta?: string;
}

type Amounts = Record<string, number>;

function addAmount(acc: Amounts, currency: string, amount: number) {
  acc[currency] = (acc[currency] ?? 0) + amount;
}

/** Líneas de importe por moneda para el `sub` de una KpiCard. */
function amountLines(amounts: Amounts, tone: KpiTone): ReactNode {
  const entries = Object.entries(amounts);
  if (entries.length === 0) return <div className="font-mono text-[13px] text-muted">$ 0</div>;
  return entries.map(([currency, amount]) => (
    <div key={currency} className="flex items-center gap-2">
      <KpiDot tone={tone} />
      <span className="truncate font-mono text-[13px] text-muted">
        {formatMoney(amount, currency)}
      </span>
    </div>
  ));
}

/** Importes por moneda en una sola línea compacta (para filas de ranking). */
function amountsInline(amounts: Amounts): string {
  const entries = Object.entries(amounts);
  if (entries.length === 0) return "$ 0";
  return entries.map(([c, a]) => formatMoney(a, c)).join("  ·  ");
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote.dashboard")) redirect("/crm");
  const access = quoteAccess(user);

  const dateFrom = searchParams.desde || undefined;
  const dateTo = searchParams.hasta || undefined;

  const db = await getSupabaseServerClient();
  const [quotes, statusMap] = await Promise.all([
    listPipelineQuotes(db, { dateFrom, dateTo, includeClosed: true }),
    getQuoteStatusMap(db),
  ]);

  // Acumuladores.
  const totalByCurrency: Amounts = {};
  const wonByCurrency: Amounts = {};
  const reviewByCurrency: Amounts = {};
  let wonCount = 0;
  let reviewCount = 0;

  const byStatus = new Map<string, { count: number; amounts: Amounts }>();
  const byKam = new Map<
    string,
    { name: string; count: number; wonCount: number; won: Amounts }
  >();
  const byClient = new Map<string, { name: string; count: number; amounts: Amounts }>();

  for (const q of quotes) {
    const { total } = calcQuote(
      q.quote_items.map((i) => ({
        clientPrice: i.client_price,
        costPrice: i.cost_price,
        quantity: i.quantity,
        isGroup: i.is_group,
      })),
      { role: access.priceRole, hasIva: q.has_iva, ivaPercentage: q.iva_percentage },
    );
    const won = WON_STATUSES.has(q.status);

    addAmount(totalByCurrency, q.currency, total);
    if (won) {
      wonCount += 1;
      addAmount(wonByCurrency, q.currency, total);
    }
    if (q.status === "under_review") {
      reviewCount += 1;
      addAmount(reviewByCurrency, q.currency, total);
    }

    const st = byStatus.get(q.status) ?? { count: 0, amounts: {} };
    st.count += 1;
    addAmount(st.amounts, q.currency, total);
    byStatus.set(q.status, st);

    const kamKey = q.kam?.id ?? "none";
    const kam = byKam.get(kamKey) ?? {
      name: q.kam?.name ?? "Sin asignar",
      count: 0,
      wonCount: 0,
      won: {},
    };
    kam.count += 1;
    if (won) {
      kam.wonCount += 1;
      addAmount(kam.won, q.currency, total);
    }
    byKam.set(kamKey, kam);

    const clientKey = q.client?.id ?? "none";
    const client = byClient.get(clientKey) ?? {
      name: q.client?.name ?? "Sin cliente",
      count: 0,
      amounts: {},
    };
    client.count += 1;
    addAmount(client.amounts, q.currency, total);
    byClient.set(clientKey, client);
  }

  const totalCount = quotes.length;
  const conversion = totalCount === 0 ? 0 : Math.round((wonCount / totalCount) * 100);

  // Pipeline por estado: estados presentes, ordenados por sort_order del catálogo.
  const statusRows = [...byStatus.entries()]
    .map(([code, v]) => ({ meta: resolveStatus(statusMap, code), ...v }))
    .sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);
  const maxStatusCount = Math.max(1, ...statusRows.map((r) => r.count));

  const kamRows = [...byKam.values()].sort(
    (a, b) => b.wonCount - a.wonCount || b.count - a.count,
  );
  const clientRows = [...byClient.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Métricas globales de cotizaciones.</p>
        </div>
        <form
          method="GET"
          action="/crm/dashboard"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-glass p-3 backdrop-blur-xl"
        >
          <div>
            <label htmlFor="d-desde" className="mb-1 block text-xs font-semibold text-muted">
              Desde
            </label>
            <input
              id="d-desde"
              name="desde"
              type="date"
              defaultValue={searchParams.desde ?? ""}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-green"
            />
          </div>
          <div>
            <label htmlFor="d-hasta" className="mb-1 block text-xs font-semibold text-muted">
              Hasta
            </label>
            <input
              id="d-hasta"
              name="hasta"
              type="date"
              defaultValue={searchParams.hasta ?? ""}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-green"
            />
          </div>
          <button
            type="submit"
            className="cursor-pointer rounded-pill bg-green px-5 py-2 text-sm font-semibold text-green-ink transition hover:brightness-105"
          >
            Filtrar
          </button>
          <a href="/crm/dashboard" className="pb-2 text-sm text-muted transition hover:text-ink">
            Limpiar
          </a>
        </form>
      </div>

      {/* Fila de KPIs de ventas */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Total cotizaciones"
          value={totalCount}
          icon={QUOTE_KPI_ICONS.total}
          tone="purple"
          highlight
          sub={amountLines(totalByCurrency, "purple")}
        />
        <KpiCard
          label="Cotizaciones ganadas"
          value={wonCount}
          icon={QUOTE_KPI_ICONS.accepted}
          tone="green"
          sub={amountLines(wonByCurrency, "green")}
        />
        <KpiCard
          label="Tasa de conversión"
          value={`${conversion}%`}
          hint="Ganadas / total"
          icon={QUOTE_KPI_ICONS.sent}
          tone="purple"
        />
        <KpiCard
          label="Total en revisión"
          value={reviewCount}
          icon={QUOTE_KPI_ICONS.under_review}
          tone="warn"
          sub={amountLines(reviewByCurrency, "warn")}
        />
      </div>

      {/* Pipeline por estado */}
      <section className="mt-6 rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <h2 className="mb-4 text-lg font-bold tracking-tight">Pipeline por estado</h2>
        {statusRows.length === 0 ? (
          <p className="text-sm text-muted">Sin cotizaciones en el período.</p>
        ) : (
          <div className="space-y-3">
            {statusRows.map((r) => (
              <div key={r.meta.code} className="flex items-center gap-4">
                <div className="w-40 shrink-0">
                  <Badge color={r.meta.color} variant={r.meta.variant} onColor={r.meta.onColor}>
                    {r.meta.label}
                  </Badge>
                </div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                  <div
                    className="h-full rounded-pill"
                    style={{
                      width: `${(r.count / maxStatusCount) * 100}%`,
                      background: r.meta.color,
                    }}
                  />
                </div>
                <div className="w-12 shrink-0 text-right font-mono text-sm font-bold text-ink">
                  {r.count}
                </div>
                <div className="w-56 shrink-0 text-right font-mono text-[12px] text-muted">
                  {amountsInline(r.amounts)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Ranking por KAM/PM */}
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Por KAM / PM</h2>
          {kamRows.length === 0 ? (
            <p className="text-sm text-muted">Sin datos.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>KAM / PM</Th>
                  <Th className="text-right">Cotiz.</Th>
                  <Th className="text-right">Ganadas</Th>
                  <Th className="text-right">Monto ganado</Th>
                </tr>
              </thead>
              <tbody>
                {kamRows.map((k) => (
                  <tr key={k.name} className="transition hover:bg-surface-2">
                    <Td className="text-sm font-semibold">{k.name}</Td>
                    <Td className="text-right font-mono text-sm">{k.count}</Td>
                    <Td className="text-right font-mono text-sm font-bold text-green">
                      {k.wonCount}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-mono text-[12px] text-muted">
                      {amountsInline(k.won)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {/* Top clientes */}
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Top clientes</h2>
          {clientRows.length === 0 ? (
            <p className="text-sm text-muted">Sin datos.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th className="text-right">Cotiz.</Th>
                  <Th className="text-right">Monto cotizado</Th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((c) => (
                  <tr key={c.name} className="transition hover:bg-surface-2">
                    <Td className="max-w-[24ch] truncate text-sm font-semibold">{c.name}</Td>
                    <Td className="text-right font-mono text-sm font-bold">{c.count}</Td>
                    <Td className="whitespace-nowrap text-right font-mono text-[12px] text-muted">
                      {amountsInline(c.amounts)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
