import { notFound, redirect } from "next/navigation";
import { calcQuote, formatDate, formatMoney } from "@agency-os/domain";
import { getQuoteById } from "@agency-os/db";
import { getCurrentUser, quoteAccess } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus } from "@/lib/quote-status-catalog";
import { PrintButton } from "@/components/crm/print-button";

export const dynamic = "force-dynamic";

/** PDF de la cotización (impresión del navegador).
 * vista=cliente: solo precios de cliente. vista=interna: costos y margen
 * (requiere quote.see_costs — si no, cae a la vista cliente). */
export default async function QuotePrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { vista?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = quoteAccess(user);

  const db = await getSupabaseServerClient();
  const quote = await getQuoteById(db, params.id);
  if (!quote) notFound();

  const statusLabel = resolveStatus(await getQuoteStatusMap(db), quote.status).label;

  // Vista interna (costos + margen) solo para quien ve ambos precios (admin).
  const internal = searchParams.vista === "interna" && access.seeMargin;

  // Precio de línea a mostrar: cliente para admin/viewer, costo para el creador.
  const unitPrice = (item: { client_price: number; cost_price: number }) =>
    access.seeClientPrice ? item.client_price : item.cost_price;

  const totals = calcQuote(
    quote.quote_items.map((item) => ({
      clientPrice: item.client_price,
      costPrice: item.cost_price,
      quantity: item.quantity,
      isGroup: item.is_group,
    })),
    { role: access.priceRole, hasIva: quote.has_iva, ivaPercentage: quote.iva_percentage },
  );

  const money = (n: number) => formatMoney(n, quote.currency);

  return (
    <main className="mx-auto max-w-[820px] px-10 py-12 font-sans">
      <div className="mb-8 flex items-start justify-between gap-6 print:mb-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/images/LBRU-negro.svg" alt="Laburu" className="h-8 w-auto" />
          <div className="mt-4 font-mono text-sm font-bold">{quote.code ?? "BORRADOR"}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">
            {quote.quote_name ?? "Cotización"}
          </div>
          {internal && (
            <div className="mt-1 inline-block rounded-pill bg-[#f2f2f3] px-3 py-1 text-xs font-semibold text-[#71717a]">
              Vista interna · incluye costos — no compartir con el cliente
            </div>
          )}
        </div>
        <div className="text-right text-sm text-[#71717a]">
          <div>
            <span className="font-semibold text-[#161618]">Estado:</span> {statusLabel}
          </div>
          <div>
            <span className="font-semibold text-[#161618]">Fecha:</span>{" "}
            {formatDate(quote.sent_at ?? quote.created_at)}
          </div>
          {quote.event_date && (
            <div>
              <span className="font-semibold text-[#161618]">Evento:</span>{" "}
              {formatDate(quote.event_date)}
            </div>
          )}
          <div>
            <span className="font-semibold text-[#161618]">Moneda:</span> {quote.currency}
          </div>
        </div>
      </div>

      {quote.client && (
        <div className="mb-8 rounded-lg border border-[#e4e4e7] p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
            Cliente
          </div>
          <div className="mt-1.5 text-base font-bold">{quote.client.name}</div>
          <div className="text-sm text-[#71717a]">
            {[quote.client.company, quote.client.nit && `NIT ${quote.client.nit}`, quote.client.email]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      )}

      {quote.message && <p className="mb-8 text-sm leading-relaxed">{quote.message}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-[#161618] text-left text-xs font-semibold uppercase tracking-wider">
            <th className="py-2.5 pr-3">Descripción</th>
            <th className="w-14 py-2.5 pr-3 text-center">Cant.</th>
            <th className="w-32 py-2.5 pr-3 text-right">Precio unit.</th>
            {internal && <th className="w-32 py-2.5 pr-3 text-right">Costo unit.</th>}
            <th className="w-32 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.quote_items.map((item) =>
            item.is_group ? (
              <tr key={item.id}>
                <td
                  colSpan={internal ? 5 : 4}
                  className="pb-1.5 pt-5 text-xs font-bold uppercase tracking-widest text-[#71717a]"
                >
                  {item.description}
                </td>
              </tr>
            ) : (
              <tr key={item.id} className="border-b border-[#e4e4e7]">
                <td className="py-2.5 pr-3">
                  {item.description}
                  {internal && item.supplier && (
                    <span className="text-[#a1a1aa]"> · {item.supplier}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-center">{item.quantity}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-[13px]">
                  {money(unitPrice(item))}
                </td>
                {internal && (
                  <td className="py-2.5 pr-3 text-right font-mono text-[13px] text-[#71717a]">
                    {money(item.cost_price)}
                  </td>
                )}
                <td className="py-2.5 text-right font-mono text-[13px] font-bold">
                  {money(unitPrice(item) * item.quantity)}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <dl className="w-72 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-[#71717a]">Subtotal</dt>
            <dd className="font-mono font-bold">{money(totals.subtotalClient)}</dd>
          </div>
          {quote.has_iva && (
            <div className="flex justify-between">
              <dt className="text-[#71717a]">IVA ({quote.iva_percentage}%)</dt>
              <dd className="font-mono">{money(totals.ivaAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-[#161618] pt-2 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-mono font-bold">{money(totals.total)}</dd>
          </div>
          {internal && (
            <>
              <div className="flex justify-between pt-2">
                <dt className="text-[#71717a]">Costo total</dt>
                <dd className="font-mono">{money(totals.subtotalCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#71717a]">Margen</dt>
                <dd className="font-mono font-bold">
                  {money(totals.margin)} ({totals.marginPercentage.toFixed(1)}%)
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {internal && (quote.purchase_order || quote.invoice_number) && (
        <div className="mt-8 rounded-lg border border-[#e4e4e7] p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
            Documentos comerciales
          </div>
          <div className="mt-2 flex flex-wrap gap-8 text-sm">
            {quote.purchase_order && (
              <div>
                <span className="text-[#71717a]">Orden de compra: </span>
                <span className="font-semibold">{quote.purchase_order}</span>
              </div>
            )}
            {quote.invoice_number && (
              <div>
                <span className="text-[#71717a]">Número de factura: </span>
                <span className="font-semibold">{quote.invoice_number}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {internal && quote.internal_notes && (
        <div className="mt-6 rounded-lg border border-[#e4e4e7] p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
            Notas internas
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {quote.internal_notes}
          </p>
        </div>
      )}

      <div className="mt-12 flex items-center justify-between border-t border-[#e4e4e7] pt-6 text-xs text-[#a1a1aa] print:mt-8">
        <span>
          Generado con Agency OS · {formatDate(quote.sent_at ?? quote.created_at)}
        </span>
        <PrintButton />
      </div>
    </main>
  );
}
