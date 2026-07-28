import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getClientById, listClientQuotes } from "@agency-os/db";
import { calcQuote, formatMoney } from "@agency-os/domain";
import { KpiCard, KpiDot, type KpiTone } from "@agency-os/ui";
import { getCurrentUser, hasPermission, quoteAccess } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus } from "@/lib/quote-status-catalog";
import { ClientForm } from "@/components/crm/client-form";
import { ClientDangerZone } from "@/components/crm/client-danger-zone";
import {
  ClientQuoteHistory,
  type ClientQuoteHistoryRow,
} from "@/components/crm/client-quote-history";
import { QUOTE_KPI_ICONS } from "@/components/crm/kpi-icons";

export const dynamic = "force-dynamic";

// Estados que cuentan como "ganado" (decisión de negocio).
const WON_STATUSES = new Set(["accepted", "purchased", "closed"]);

/** Líneas de importe por moneda para el `sub` de una KpiCard. */
function amountLines(amounts: Record<string, number>, tone: KpiTone): ReactNode {
  const entries = Object.entries(amounts);
  if (entries.length === 0) {
    return <div className="font-mono text-[13px] text-muted">$ 0</div>;
  }
  return entries.map(([currency, amount]) => (
    <div key={currency} className="flex items-center gap-1.5 font-mono text-[13px] text-muted">
      <KpiDot tone={tone} />
      <span className="font-bold text-ink">{formatMoney(amount, currency)}</span>
    </div>
  ));
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "client.manage")) redirect("/crm");
  const access = quoteAccess(user);

  const db = await getSupabaseServerClient();
  const client = await getClientById(db, params.id);
  if (!client) notFound();

  const [quotes, statusMap] = await Promise.all([
    listClientQuotes(db, client.id),
    getQuoteStatusMap(db),
  ]);

  // KPIs por cliente + filas del historial (un solo recorrido).
  const totalByCurrency: Record<string, number> = {};
  const wonByCurrency: Record<string, number> = {};
  const reviewByCurrency: Record<string, number> = {};
  let wonCount = 0;
  let reviewCount = 0;

  const historyRows: ClientQuoteHistoryRow[] = quotes.map((q) => {
    const totals = calcQuote(
      q.quote_items.map((i) => ({
        clientPrice: i.client_price,
        costPrice: i.cost_price,
        quantity: i.quantity,
        isGroup: i.is_group,
      })),
      { role: access.priceRole, hasIva: q.has_iva, ivaPercentage: q.iva_percentage },
    );
    totalByCurrency[q.currency] = (totalByCurrency[q.currency] ?? 0) + totals.total;
    if (WON_STATUSES.has(q.status)) {
      wonCount += 1;
      wonByCurrency[q.currency] = (wonByCurrency[q.currency] ?? 0) + totals.total;
    }
    if (q.status === "under_review") {
      reviewCount += 1;
      reviewByCurrency[q.currency] = (reviewByCurrency[q.currency] ?? 0) + totals.total;
    }
    const s = resolveStatus(statusMap, q.status);
    return {
      id: q.id,
      code: q.code,
      quoteName: q.quote_name,
      status: { label: s.label, color: s.color, variant: s.variant, onColor: s.onColor ?? null },
      total: totals.total,
      currency: q.currency,
      createdAt: q.created_at,
    };
  });

  const totalCount = quotes.length;
  const conversion = totalCount === 0 ? 0 : Math.round((wonCount / totalCount) * 100);

  return (
    <div>
      <div className="mb-6">
        <a href="/crm/clientes" className="text-sm text-muted transition hover:text-ink">
          ← Clientes
        </a>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          {client.code && (
            <span className="rounded-pill bg-glass px-3 py-1 font-mono text-[13px] font-bold text-muted">
              {client.code}
            </span>
          )}
        </div>
        {client.company && <p className="mt-1 text-sm text-muted">{client.company}</p>}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Perfil del cliente</h2>
          <ClientForm
            initial={{
              id: client.id,
              name: client.name,
              company: client.company ?? "",
              code: client.code ?? "",
              nit: client.nit ?? "",
              responsible: client.responsible ?? "",
              email: client.email ?? "",
              phone: client.phone ?? "",
            }}
          />
        </section>

        <aside>
          <ClientDangerZone clientId={client.id} quoteCount={totalCount} />
        </aside>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold tracking-tight">Historial de cotizaciones</h2>
        {historyRows.length === 0 ? (
          <div className="rounded-lg border border-line bg-glass px-8 py-12 text-center text-sm text-muted backdrop-blur-xl">
            Este cliente todavía no tiene cotizaciones.
          </div>
        ) : (
          <ClientQuoteHistory rows={historyRows} />
        )}
      </section>
    </div>
  );
}
