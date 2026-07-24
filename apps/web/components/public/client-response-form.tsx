"use client";

import { useState } from "react";
import { calcQuote, formatMoney } from "@agency-os/domain";
import {
  submitClientResponse,
  type PublicItemChoice,
} from "@/lib/public-response-actions";

export interface ClientFormItem {
  id: string;
  description: string;
  quantity: number;
  clientPrice: number;
  isGroup: boolean;
  /** Estado previo (para prellenar si ya respondió). */
  status: "pending" | "accepted" | "rejected" | "changes";
  comment: string;
}

interface Props {
  token: string;
  items: ClientFormItem[];
  currency: string;
  hasIva: boolean;
  ivaPercentage: number;
}

const CHOICES: { value: PublicItemChoice; label: string }[] = [
  { value: "accepted", label: "Acepto" },
  { value: "changes", label: "Pido cambios" },
  { value: "rejected", label: "Rechazo" },
];

const CHOICE_STYLE: Record<PublicItemChoice, string> = {
  accepted: "border-emerald-500 bg-emerald-50 text-emerald-700",
  changes: "border-amber-500 bg-amber-50 text-amber-700",
  rejected: "border-red-500 bg-red-50 text-red-700",
};

type ItemState = { status: PublicItemChoice; comment: string };

export function ClientResponseForm({
  token,
  items,
  currency,
  hasIva,
  ivaPercentage,
}: Props) {
  const realItems = items.filter((i) => !i.isGroup);
  const alreadyResponded = realItems.some((i) => i.status !== "pending");

  // Totales de la propuesta tal como se cotizó (sin costos: el cliente nunca los ve).
  const totals = calcQuote(
    items.map((i) => ({
      clientPrice: i.clientPrice,
      costPrice: 0,
      quantity: i.quantity,
      isGroup: i.isGroup,
    })),
    { role: "kam", hasIva, ivaPercentage },
  );

  const [state, setState] = useState<Record<string, ItemState>>(() => {
    const initial: Record<string, ItemState> = {};
    for (const it of realItems) {
      initial[it.id] = {
        // 'pending' aún no es una elección del cliente → arranca en "Acepto".
        status: it.status === "pending" ? "accepted" : it.status,
        comment: it.comment ?? "",
      };
    }
    return initial;
  });
  const [generalComment, setGeneralComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | PublicItemChoice | string>(null);

  const money = (n: number) => formatMoney(n, currency);

  const FALLBACK: ItemState = { status: "accepted", comment: "" };
  const st = (id: string): ItemState => state[id] ?? FALLBACK;

  function setItem(id: string, patch: Partial<ItemState>) {
    setState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? FALLBACK), ...patch } }));
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitClientResponse(token, {
      generalComment,
      items: realItems.map((it) => ({
        id: it.id,
        status: st(it.id).status,
        comment: st(it.id).comment,
      })),
    });
    setSubmitting(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("ok" in result && result.ok) setDone(result.status);
  }

  if (done) {
    const msg =
      done === "accepted"
        ? "¡Gracias! Registramos que aceptas la propuesta. Tu asesor de Laburu te contactará para los siguientes pasos."
        : done === "rejected"
          ? "Registramos tu respuesta. Gracias por tu tiempo."
          : "¡Gracias! Registramos tus comentarios. Tu asesor de Laburu revisará los cambios solicitados y te enviará una propuesta actualizada.";
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="text-lg font-bold text-emerald-800">Respuesta enviada</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-700">{msg}</p>
      </div>
    );
  }

  return (
    <div>
      {alreadyResponded && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ya habías enviado una respuesta. Puedes actualizarla y volver a enviar.
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-[#161618] text-left text-xs font-semibold uppercase tracking-wider">
            <th className="py-2.5 pr-3">Descripción</th>
            <th className="w-14 py-2.5 pr-3 text-center">Cant.</th>
            <th className="w-32 py-2.5 pr-3 text-right">Precio unit.</th>
            <th className="w-32 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) =>
            item.isGroup ? (
              <tr key={item.id}>
                <td
                  colSpan={4}
                  className="pb-1.5 pt-5 text-xs font-bold uppercase tracking-widest text-[#71717a]"
                >
                  {item.description}
                </td>
              </tr>
            ) : (
              <tr key={item.id} className="border-b border-[#e4e4e7] align-top">
                <td className="py-3 pr-3">
                  <div>{item.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CHOICES.map((c) => {
                      const active = st(item.id).status === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setItem(item.id, { status: c.value })}
                          className={`rounded-pill border px-3 py-1 text-xs font-semibold transition ${
                            active
                              ? CHOICE_STYLE[c.value]
                              : "border-[#e4e4e7] bg-white text-[#71717a] hover:border-[#a1a1aa]"
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {st(item.id).status !== "accepted" && (
                    <textarea
                      value={st(item.id).comment}
                      onChange={(e) => setItem(item.id, { comment: e.target.value })}
                      placeholder={
                        st(item.id).status === "changes"
                          ? "¿Qué cambios necesitas en este ítem?"
                          : "Motivo (opcional)"
                      }
                      rows={2}
                      className="mt-2 w-full rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm text-[#161618] outline-none focus:border-[#a1a1aa]"
                    />
                  )}
                </td>
                <td className="py-3 pr-3 text-center">{item.quantity}</td>
                <td className="py-3 pr-3 text-right font-mono text-[13px]">
                  {money(item.clientPrice)}
                </td>
                <td className="py-3 text-right font-mono text-[13px] font-bold">
                  {money(item.clientPrice * item.quantity)}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end border-t border-[#e4e4e7] pt-6">
        <dl className="w-72 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-[#71717a]">Subtotal</dt>
            <dd className="font-mono font-bold">{money(totals.subtotalClient)}</dd>
          </div>
          {hasIva && (
            <div className="flex justify-between">
              <dt className="text-[#71717a]">IVA ({ivaPercentage}%)</dt>
              <dd className="font-mono">{money(totals.ivaAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-[#161618] pt-2 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-mono font-bold">{money(totals.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
          Comentario general (opcional)
        </label>
        <textarea
          value={generalComment}
          onChange={(e) => setGeneralComment(e.target.value)}
          rows={3}
          placeholder="¿Algo que quieras contarle a tu asesor?"
          className="mt-2 w-full rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm text-[#161618] outline-none focus:border-[#a1a1aa]"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-pill bg-[#161618] px-6 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
        >
          {submitting ? "Enviando…" : "Enviar respuesta"}
        </button>
      </div>
    </div>
  );
}
