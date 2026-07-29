"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@agency-os/ui";
import { formatMoney } from "@agency-os/domain";
import { setQuoteStatus } from "@/lib/quote-actions";

export interface KanbanColumn {
  code: string;
  label: string;
  color: string;
  variant: "soft" | "solid";
  onColor: string | null;
}

export interface KanbanCard {
  id: string;
  code: string | null;
  quoteName: string | null;
  clientName: string | null;
  kamName: string | null;
  status: string;
  currency: string;
  total: number;
  createdAt: string;
}

/** Suma de importes por moneda de un grupo de tarjetas. */
function sumByCurrency(cards: KanbanCard[]): [string, number][] {
  const acc: Record<string, number> = {};
  for (const c of cards) acc[c.currency] = (acc[c.currency] ?? 0) + c.total;
  return Object.entries(acc);
}

export function KanbanBoard({
  columns,
  cards,
  canMove,
}: {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  canMove: boolean;
}) {
  const router = useRouter();
  // Estado por tarjeta (status) para el movimiento optimista.
  const [statusById, setStatusById] = useState<Record<string, string>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, c.status])),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const byCol: Record<string, KanbanCard[]> = {};
    for (const col of columns) byCol[col.code] = [];
    for (const c of cards) {
      const st = statusById[c.id] ?? c.status;
      (byCol[st] ??= []).push(c);
    }
    return byCol;
  }, [columns, cards, statusById]);

  const move = async (cardId: string, from: string, to: string) => {
    if (from === to || savingRef.current.has(cardId)) return;
    savingRef.current.add(cardId);
    setError(null);
    setStatusById((s) => ({ ...s, [cardId]: to })); // optimista
    const res = await setQuoteStatus(cardId, to);
    savingRef.current.delete(cardId);
    if (res.error) {
      setStatusById((s) => ({ ...s, [cardId]: from })); // rollback
      setError(res.error);
    } else {
      router.refresh();
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colCards = grouped[col.code] ?? [];
          const sums = sumByCurrency(colCards);
          return (
            <div
              key={col.code}
              onDragOver={(e) => {
                if (!canMove || !dragId) return;
                e.preventDefault();
                setOverCol(col.code);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.code ? null : c))}
              onDrop={() => {
                if (!canMove || !dragId) return;
                const from = statusById[dragId] ?? "";
                setOverCol(null);
                void move(dragId, from, col.code);
                setDragId(null);
              }}
              className={`flex w-[300px] shrink-0 flex-col rounded-lg border bg-glass p-3 backdrop-blur-xl transition ${
                overCol === col.code ? "border-green" : "border-line"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <Badge color={col.color} variant={col.variant} onColor={col.onColor ?? undefined}>
                  {col.label}
                </Badge>
                <span className="font-mono text-xs font-bold text-muted">{colCards.length}</span>
              </div>
              {sums.length > 0 && (
                <div className="mb-3 space-y-0.5 px-1">
                  {sums.map(([cur, amt]) => (
                    <div key={cur} className="font-mono text-[11px] text-faint">
                      {formatMoney(amt, cur)}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex max-h-[calc(100vh-360px)] min-h-[80px] flex-col gap-2 overflow-y-auto pr-1">
                {colCards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    draggable={canMove}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    onClick={() => router.push(`/crm/${c.id}`)}
                    className={`rounded-md border border-line bg-glass-strong p-3 text-left backdrop-blur-xl transition hover:border-line-strong ${
                      canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    } ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-bold text-ink">
                        {c.code ?? "— borrador —"}
                      </span>
                      <span className="font-mono text-[12px] font-bold text-ink">
                        {formatMoney(c.total, c.currency)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm text-ink">{c.quoteName ?? "—"}</div>
                    {c.clientName && (
                      <div className="mt-0.5 truncate text-[12px] text-muted">{c.clientName}</div>
                    )}
                    {c.kamName && (
                      <div className="mt-2 inline-flex items-center rounded-pill border border-line-strong px-2 py-0.5 text-[11px] font-semibold text-muted">
                        {c.kamName}
                      </div>
                    )}
                  </button>
                ))}
                {colCards.length === 0 && (
                  <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">
                    Sin cotizaciones
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
