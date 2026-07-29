import { notFound } from "next/navigation";
import { formatDate, formatMoney, isTokenExpired } from "@agency-os/domain";
import {
  createSupabaseServiceRoleClient,
  getQuoteById,
  getSupplierOrderByToken,
} from "@agency-os/db";
import { SupplierConfirm } from "@/components/public/supplier-confirm";

export const dynamic = "force-dynamic";

interface OrderItem {
  description: string;
  quantity: number;
  cost_price: number;
}

function parseItems(items: unknown): OrderItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    return {
      description: String(it.description ?? ""),
      quantity: Number(it.quantity ?? 0),
      cost_price: Number(it.cost_price ?? 0),
    };
  });
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-20 text-center sm:px-10">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-[#71717a]">{body}</p>
    </main>
  );
}

/** Vista pública del proveedor por magic link: revisa la orden y confirma recepción.
 * Se resuelve server-side con service_role (sin policy anónima en RLS). */
export default async function SupplierResponsePage({
  params,
}: {
  params: { token: string };
}) {
  const db = createSupabaseServiceRoleClient();
  const order = await getSupplierOrderByToken(db, params.token);
  if (!order) notFound();

  if (isTokenExpired(order.expires_at)) {
    return (
      <Notice
        title="El enlace ha expirado"
        body="Esta orden ya no está disponible. Contacta a Laburu Agency para reenviártela."
      />
    );
  }

  const quote = await getQuoteById(db, order.quote_id);
  const currency = quote?.currency ?? "COP";
  const money = (n: number) => formatMoney(n, currency);
  const items = parseItems(order.items);
  const total = items.reduce((sum, it) => sum + it.cost_price * it.quantity, 0);
  const confirmed = order.status === "confirmed";

  return (
    <main className="mx-auto max-w-[860px] px-6 py-10 font-sans sm:px-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-sm font-bold">
            Orden {quote?.code ? `· ${quote.code}` : ""}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Orden de compra — {order.supplier_name}
          </h1>
        </div>
        <div className="text-right text-sm text-[#71717a]">
          {order.sent_at && (
            <div>
              <span className="font-semibold text-[#161618]">Enviada:</span>{" "}
              {formatDate(order.sent_at)}
            </div>
          )}
          <div>
            <span className="font-semibold text-[#161618]">Moneda:</span> {currency}
          </div>
        </div>
      </div>

      {order.message && (
        <div className="mb-6 rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-5 sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#71717a]">
            Mensaje de Laburu Agency
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-[#161618]">{order.message}</p>
        </div>
      )}

      <div className="rounded-lg border border-[#e4e4e7] bg-white p-5 sm:p-7">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[#161618] text-left text-xs font-semibold uppercase tracking-wider">
              <th className="py-2.5 pr-3">Descripción</th>
              <th className="w-16 py-2.5 pr-3 text-center">Cant.</th>
              <th className="w-32 py-2.5 pr-3 text-right">Costo unit.</th>
              <th className="w-32 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-[#e4e4e7]">
                <td className="py-2.5 pr-3">{it.description}</td>
                <td className="py-2.5 pr-3 text-center">{it.quantity}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-[13px]">
                  {money(it.cost_price)}
                </td>
                <td className="py-2.5 text-right font-mono text-[13px] font-bold">
                  {money(it.cost_price * it.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end border-t border-[#e4e4e7] pt-4">
          <dl className="w-72 text-sm">
            <div className="flex justify-between text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-mono font-bold">{money(total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-[#e4e4e7] bg-white p-5 sm:p-7">
        {confirmed ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="text-lg font-bold text-emerald-800">Ya confirmaste esta orden</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-emerald-700">
              {order.confirmed_at && `Confirmada el ${formatDate(order.confirmed_at)}. `}
              Gracias por tu confirmación.
            </p>
            {order.supplier_comment && (
              <p className="mx-auto mt-3 max-w-md text-sm italic text-emerald-700">
                “{order.supplier_comment}”
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-[#71717a]">
              Confirma que recibiste esta orden de compra. Puedes dejar un comentario con tiempos
              de entrega u observaciones.
            </p>
            <SupplierConfirm token={params.token} />
          </>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-[#a1a1aa]">Laburu Agency</p>
    </main>
  );
}
