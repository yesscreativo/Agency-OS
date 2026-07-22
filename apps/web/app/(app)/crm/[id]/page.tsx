import { notFound, redirect } from "next/navigation";
import { getQuoteById, listClients, listKams, listQuoteVersions } from "@agency-os/db";
import { Badge } from "@agency-os/ui";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus } from "@/lib/quote-status-catalog";
import { QuoteForm, type QuoteFormInitial } from "@/components/crm/quote-form";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const quote = await getQuoteById(db, params.id);
  if (!quote) notFound();

  const [{ rows: clients }, versions, kams, statusMap] = await Promise.all([
    listClients(db, { pageSize: 200 }),
    listQuoteVersions(db, quote.id),
    listKams(db),
    getQuoteStatusMap(db),
  ]);
  const statusMeta = resolveStatus(statusMap, quote.status);

  // Solo KAMs activas en el select, pero sin perder una asignación previa inactiva.
  const kamOptions = kams
    .filter((k) => k.is_active || k.id === quote.kam_id)
    .map((k) => ({ id: k.id, name: k.name }));

  // El brief se guarda como ruta del bucket privado; el enlace se firma aquí.
  let briefSignedUrl: string | null = null;
  if (quote.brief_url) {
    const { data } = await db.storage.from("briefs").createSignedUrl(quote.brief_url, 60 * 60);
    briefSignedUrl = data?.signedUrl ?? quote.brief_url;
  }

  const initial: QuoteFormInitial = {
    id: quote.id,
    status: quote.status,
    clientId: quote.client_id,
    kamId: quote.kam_id,
    quoteType: quote.quote_type,
    quoteName: quote.quote_name,
    message: quote.message,
    internalNotes: quote.internal_notes,
    currency: quote.currency,
    eventDate: quote.event_date,
    hasIva: quote.has_iva,
    ivaPercentage: quote.iva_percentage,
    briefPath: quote.brief_url,
    items: quote.quote_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      clientPrice: item.client_price,
      costPrice: item.cost_price,
      supplier: item.supplier ?? "",
      isGroup: item.is_group,
    })),
    recipients: quote.quote_recipients.map((r) => ({ name: r.name, email: r.email })),
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <a href="/crm" className="text-sm text-muted transition hover:text-ink">
            ← Cotizaciones
          </a>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {quote.code ?? "Borrador"}
            </h1>
            <Badge color={statusMeta.color} variant={statusMeta.variant} onColor={statusMeta.onColor}>
              {statusMeta.label}
            </Badge>
          </div>
          {quote.quote_name && <p className="mt-1 text-sm text-muted">{quote.quote_name}</p>}
        </div>
      </div>
      <QuoteForm
        initial={initial}
        clients={clients.map((c) => ({ id: c.id, name: c.name, company: c.company }))}
        kams={kamOptions}
        canSeeCosts={hasPermission(user, "quote.see_costs")}
        briefSignedUrl={briefSignedUrl}
        versions={versions.map((v) => ({
          version_number: v.version_number,
          created_at: v.created_at,
        }))}
      />
    </div>
  );
}
