import { notFound, redirect } from "next/navigation";
import { getClientById, listClientQuotes } from "@agency-os/db";
import { calcQuote, formatDate, formatMoney } from "@agency-os/domain";
import { Badge, Table, Td, Th } from "@agency-os/ui";
import { getCurrentUser, hasPermission, quoteAccess } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus } from "@/lib/quote-status-catalog";
import { ClientForm } from "@/components/crm/client-form";

export const dynamic = "force-dynamic";

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

  // Resumen: nº cotizaciones, total por moneda, aceptadas.
  const totalsByCurrency: Record<string, number> = {};
  let acceptedCount = 0;
  const history = quotes.map((q) => {
    const totals = calcQuote(
      q.quote_items.map((i) => ({
        clientPrice: i.client_price,
        costPrice: i.cost_price,
        quantity: i.quantity,
        isGroup: i.is_group,
      })),
      { role: access.priceRole, hasIva: q.has_iva, ivaPercentage: q.iva_percentage },
    );
    totalsByCurrency[q.currency] = (totalsByCurrency[q.currency] ?? 0) + totals.total;
    if (q.status === "accepted") acceptedCount += 1;
    return { ...q, total: totals.total };
  });
  const currencyLines = Object.entries(totalsByCurrency);

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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-line bg-surface p-6">
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
            quoteCount={quotes.length}
          />
        </section>

        <aside className="rounded-lg border border-line bg-surface p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Resumen</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Cotizaciones</dt>
              <dd className="font-mono font-bold">{quotes.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Aceptadas</dt>
              <dd className="font-mono font-bold text-green">{acceptedCount}</dd>
            </div>
            <div className="border-t border-line pt-2">
              <dt className="text-muted">Total cotizado</dt>
              {currencyLines.length === 0 ? (
                <dd className="mt-1 font-mono text-muted">$ 0</dd>
              ) : (
                currencyLines.map(([currency, amount]) => (
                  <dd key={currency} className="mt-1 font-mono font-bold">
                    {formatMoney(amount, currency)}
                  </dd>
                ))
              )}
            </div>
          </dl>
        </aside>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold tracking-tight">Historial de cotizaciones</h2>
        {history.length === 0 ? (
          <div className="rounded-lg border border-line bg-glass px-8 py-12 text-center text-sm text-muted backdrop-blur-xl">
            Este cliente todavía no tiene cotizaciones.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th>Estado</Th>
                <Th className="text-right">Total</Th>
                <Th>Fecha</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {history.map((q) => {
                const s = resolveStatus(statusMap, q.status);
                return (
                  <tr key={q.id} className="transition hover:bg-surface-2">
                    <Td>
                      <a
                        href={`/crm/${q.id}`}
                        className="whitespace-nowrap font-mono text-[13px] font-bold text-ink hover:text-green"
                      >
                        {q.code ?? "— borrador —"}
                      </a>
                    </Td>
                    <Td>
                      <span className="max-w-[28ch] truncate text-sm">{q.quote_name ?? "—"}</span>
                    </Td>
                    <Td>
                      <Badge color={s.color} variant={s.variant} onColor={s.onColor}>
                        {s.label}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-right font-mono text-sm font-bold">
                      {formatMoney(q.total, q.currency)}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{formatDate(q.created_at)}</Td>
                    <Td className="text-right">
                      <a
                        href={`/crm/${q.id}`}
                        className="inline-block rounded-pill border border-line-strong px-4 py-1.5 text-xs font-semibold text-ink transition hover:border-green"
                      >
                        Abrir
                      </a>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
