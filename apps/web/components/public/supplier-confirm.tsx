"use client";

import { useState } from "react";
import { confirmSupplierReception } from "@/lib/public-response-actions";

interface Props {
  token: string;
}

export function SupplierConfirm({ token }: Props) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await confirmSupplierReception(token, { comment });
    setSubmitting(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="text-lg font-bold text-emerald-800">Recepción confirmada</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-700">
          ¡Gracias! Registramos la confirmación. Laburu Agency continuará con el proceso.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
        Comentario (opcional)
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Tiempos de entrega, observaciones…"
        className="mt-2 w-full rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm text-[#161618] outline-none focus:border-[#a1a1aa]"
      />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="rounded-pill bg-[#161618] px-6 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
        >
          {submitting ? "Confirmando…" : "Confirmar recepción"}
        </button>
      </div>
    </div>
  );
}
