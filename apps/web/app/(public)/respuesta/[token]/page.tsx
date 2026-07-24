import { notFound } from "next/navigation";
import { formatDate, isTokenExpired } from "@agency-os/domain";
import {
  createSupabaseServiceRoleClient,
  getQuoteById,
  getRecipientByToken,
  markRecipientViewed,
} from "@agency-os/db";
import {
  ClientResponseForm,
  type ClientFormItem,
} from "@/components/public/client-response-form";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-20 text-center sm:px-10">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-[#71717a]">{body}</p>
    </main>
  );
}

/** Vista pública del cliente por magic link. Resuelve el token server-side con
 * service_role (no hay policy anónima en RLS). Muestra la cotización SIN costos ni
 * margen y el formulario de respuesta. */
export default async function ClientResponsePage({
  params,
}: {
  params: { token: string };
}) {
  const db = createSupabaseServiceRoleClient();
  const recipient = await getRecipientByToken(db, params.token);
  if (!recipient) notFound();

  if (isTokenExpired(recipient.expires_at)) {
    return (
      <Notice
        title="El enlace ha expirado"
        body="Este enlace de cotización ya no está disponible. Solicita uno nuevo a tu asesor de Laburu."
      />
    );
  }

  const quote = await getQuoteById(db, recipient.quote_id);
  if (!quote) notFound();

  // Marca la primera apertura (no bloquea el render si falla).
  try {
    await markRecipientViewed(db, recipient.id);
  } catch {
    /* best-effort */
  }

  const items: ClientFormItem[] = quote.quote_items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    clientPrice: item.client_price,
    isGroup: item.is_group,
    status: item.status,
    comment: item.client_comment ?? "",
  }));

  return (
    <main className="mx-auto max-w-[860px] px-6 py-10 font-sans sm:px-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-sm font-bold">{quote.code ?? "COTIZACIÓN"}</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {quote.quote_name ?? "Tu cotización"}
          </h1>
          {recipient.name && (
            <p className="mt-1 text-sm text-[#71717a]">Hola, {recipient.name} 👋</p>
          )}
        </div>
        <div className="text-right text-sm text-[#71717a]">
          <div>
            <span className="font-semibold text-[#161618]">Fecha:</span>{" "}
            {formatDate(quote.sent_at ?? quote.created_at)}
          </div>
          <div>
            <span className="font-semibold text-[#161618]">Moneda:</span> {quote.currency}
          </div>
        </div>
      </div>

      {quote.client && (
        <div className="mb-8 rounded-lg border border-[#e4e4e7] bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
            Preparada para
          </div>
          <div className="mt-1.5 text-base font-bold">
            {quote.client.company || quote.client.name}
          </div>
          {quote.client.company && quote.client.name && (
            <div className="text-sm text-[#71717a]">{quote.client.name}</div>
          )}
        </div>
      )}

      {quote.message && (
        <p className="mb-8 whitespace-pre-wrap text-sm leading-relaxed">{quote.message}</p>
      )}

      <div className="rounded-lg border border-[#e4e4e7] bg-white p-5 sm:p-7">
        <p className="mb-5 text-sm text-[#71717a]">
          Revisa cada ítem y marca tu respuesta. Puedes aceptar, pedir cambios o rechazar por
          separado, y dejar comentarios para tu asesor.
        </p>

        <ClientResponseForm
          token={params.token}
          items={items}
          currency={quote.currency}
          hasIva={quote.has_iva}
          ivaPercentage={quote.iva_percentage}
        />
      </div>

      <p className="mt-8 text-center text-xs text-[#a1a1aa]">
        Laburu Agency · Cotización {quote.code ?? ""}
      </p>
    </main>
  );
}
