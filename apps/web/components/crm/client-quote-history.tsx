"use client";

import { useState } from "react";
import { Badge, Table, Td, Th } from "@agency-os/ui";
import { formatDate, formatMoney } from "@agency-os/domain";

export interface ClientQuoteHistoryRow {
  id: string;
  code: string | null;
  quoteName: string | null;
  status: { label: string; color: string; variant: "soft" | "solid"; onColor: string | null };
  total: number;
  currency: string;
  createdAt: string;
}

const PAGE_SIZE = 10;

/** Números de página a mostrar: primera, última y vecinas de la actual, con "gap" como elipsis. */
function buildPageItems(current: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, current - 1, current, current + 1]);
  const items: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (wanted.has(p)) items.push(p);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }
  return items;
}

/** Historial de cotizaciones de un cliente con paginación en el cliente
 * (los datos ya vienen completos para calcular los KPIs de la ficha). */
export function ClientQuoteHistory({ rows }: { rows: ClientQuoteHistoryRow[] }) {
  const [page, setPage] = useState(1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <>
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
          {pageRows.map((q) => (
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
                <span className="max-w-[28ch] truncate text-sm">{q.quoteName ?? "—"}</span>
              </Td>
              <Td>
                <Badge
                  color={q.status.color}
                  variant={q.status.variant}
                  onColor={q.status.onColor ?? undefined}
                >
                  {q.status.label}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-right font-mono text-sm font-bold">
                {formatMoney(q.total, q.currency)}
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatDate(q.createdAt)}</Td>
              <Td className="text-right">
                <a
                  href={`/crm/${q.id}`}
                  className="inline-block rounded-pill border border-line-strong px-4 py-1.5 text-xs font-semibold text-ink transition hover:border-green"
                >
                  Abrir
                </a>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <div className="flex flex-wrap items-center gap-2">
            {buildPageItems(current, totalPages).map((item, i) =>
              item === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-faint">
                  …
                </span>
              ) : item === current ? (
                <span
                  key={item}
                  aria-current="page"
                  className="rounded-pill bg-green px-4 py-2 font-semibold text-green-ink"
                >
                  {item}
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
                >
                  {item}
                </button>
              ),
            )}
            {current < totalPages && (
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
              >
                Siguiente →
              </button>
            )}
          </div>
          <div>
            Página {current} de {totalPages} ({total} total)
          </div>
        </div>
      )}
    </>
  );
}
