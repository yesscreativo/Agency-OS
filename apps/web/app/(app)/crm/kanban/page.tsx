import { redirect } from "next/navigation";
import { listKams, listPipelineQuotes, listQuoteStatsRows } from "@agency-os/db";
import { calcQuote, summarizeQuoteKpis } from "@agency-os/domain";
import { getCurrentUser, hasPermission, quoteAccess } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus, statusOptions } from "@/lib/quote-status-catalog";
import { QuoteFilters } from "@/components/crm/quote-filters";
import { QuoteKpiRow } from "@/components/crm/quote-kpi-row";
import {
  KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
} from "@/components/crm/kanban-board";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  kam?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  cerradas?: string;
}

export default async function KanbanPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote.pipeline")) redirect("/crm");

  const access = quoteAccess(user);
  const canMove = hasPermission(user, "quote.approve");
  const status = searchParams.estado || undefined;
  const includeClosed = searchParams.cerradas === "1";
  const commonFilters = {
    search: searchParams.q,
    dateFrom: searchParams.desde,
    dateTo: searchParams.hasta,
    includeClosed,
    kamId: searchParams.kam || undefined,
  };

  const db = await getSupabaseServerClient();
  const [quotes, statsRows, kams, statusMap] = await Promise.all([
    listPipelineQuotes(db, { ...commonFilters, status }),
    // KPIs con los mismos filtros SALVO estado (igual que la lista).
    listQuoteStatsRows(db, commonFilters),
    listKams(db, { onlyActive: true }),
    getQuoteStatusMap(db),
  ]);

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
    access.priceRole,
  );

  const cards: KanbanCard[] = quotes.map((q) => {
    const totals = calcQuote(
      q.quote_items.map((i) => ({
        clientPrice: i.client_price,
        costPrice: i.cost_price,
        quantity: i.quantity,
        isGroup: i.is_group,
      })),
      { role: access.priceRole, hasIva: q.has_iva, ivaPercentage: q.iva_percentage },
    );
    return {
      id: q.id,
      code: q.code,
      quoteName: q.quote_name,
      clientName: q.client?.name ?? null,
      kamName: q.kam?.name ?? null,
      status: q.status,
      currency: q.currency,
      total: totals.total,
      createdAt: q.created_at,
    };
  });

  // Columnas = estados activos ordenados; se añaden al final los estados que
  // aparecen en alguna cotización pero no están activos (para no ocultar nada).
  const active = Object.values(statusMap)
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const activeCodes = new Set(active.map((m) => m.code));
  const extraCodes = [...new Set(cards.map((c) => c.status))].filter(
    (code) => !activeCodes.has(code),
  );
  const columns: KanbanColumn[] = [
    ...active,
    ...extraCodes.map((c) => resolveStatus(statusMap, c)),
  ].map((m) => ({
    code: m.code,
    label: m.label,
    color: m.color,
    variant: m.variant,
    onColor: m.onColor ?? null,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Kanban</h1>
        <p className="mt-1 text-sm text-muted">
          {canMove
            ? "Arrastra una cotización para cambiar su estado."
            : "Vista del pipeline (solo lectura)."}
        </p>
      </div>

      <div className="mb-5">
        <QuoteKpiRow kpis={kpis} includeClosed={includeClosed} />
      </div>

      <div className="mb-5">
        <QuoteFilters
          action="/crm/kanban"
          q={searchParams.q ?? ""}
          kam={searchParams.kam ?? ""}
          kams={kams.map((k) => ({ id: k.id, name: k.name }))}
          statuses={statusOptions(statusMap)}
          estado={status ?? ""}
          desde={searchParams.desde ?? ""}
          hasta={searchParams.hasta ?? ""}
          cerradas={includeClosed}
        />
      </div>

      <KanbanBoard columns={columns} cards={cards} canMove={canMove} />
    </div>
  );
}
