"use client";

// "Mis tiempos" con muchos clientes/entradas: layout maestro-detalle en vez de
// cards-acordeón. Izquierda: lista buscable de clientes (auto-selecciona el de
// mayor tiempo). Derecha: desglose por proyecto + entradas del seleccionado,
// con scroll interno (mismo patrón `ds-scroll` que el sidebar de clientes).

import { useMemo, useState } from "react";
import { Input } from "@agency-os/ui";
import { formatDuration, groupTimeByClient } from "@agency-os/domain";

export interface ClientCardEntry {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectTitle: string;
  taskTitle: string;
  minutes: number;
  spentOn: string;
  note: string | null;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export function ClientTimeMasterDetail({ entries }: { entries: ClientCardEntry[] }) {
  const groups = useMemo(() => groupTimeByClient(entries), [entries]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.clientId ?? null);

  const entriesByClient = useMemo(() => {
    const map = new Map<string, ClientCardEntry[]>();
    for (const e of entries) {
      const list = map.get(e.clientId) ?? [];
      list.push(e);
      map.set(e.clientId, list);
    }
    return map;
  }, [entries]);

  if (groups.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-line bg-glass px-8 py-16 text-center text-sm text-muted backdrop-blur-xl">
        No hay tiempo registrado en este rango.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? groups.filter((g) => g.clientName.toLowerCase().includes(q)) : groups;
  // `groups.length === 0` ya retornó arriba, así que `groups[0]` siempre existe
  // aquí — el `!` solo resuelve el tipo (noUncheckedIndexedAccess no lo infiere).
  const selected = groups.find((g) => g.clientId === selectedId) ?? filtered[0] ?? groups[0]!;
  const selectedEntries = (entriesByClient.get(selected.clientId) ?? [])
    .slice()
    .sort((a, b) => (a.spentOn < b.spentOn ? 1 : -1));

  return (
    <div className="mt-4 flex flex-col gap-4 sm:flex-row">
      <div className="w-full shrink-0 sm:w-[280px]">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente…"
          aria-label="Buscar cliente"
        />
        <div className="ds-scroll mt-2 max-h-[480px] space-y-0.5 overflow-y-auto rounded-lg border border-line bg-glass p-1.5 backdrop-blur-xl">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-faint">Sin resultados.</p>
          ) : (
            filtered.map((g) => {
              const active = g.clientId === selected.clientId;
              return (
                <button
                  key={g.clientId}
                  type="button"
                  onClick={() => setSelectedId(g.clientId)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition ${
                    active ? "bg-green font-semibold text-green-ink" : "text-ink hover:bg-surface-2"
                  }`}
                >
                  <span className="min-w-0 truncate">{g.clientName}</span>
                  <span
                    className={`shrink-0 font-mono text-xs tabular-nums ${
                      active ? "text-green-ink" : "text-muted"
                    }`}
                  >
                    {formatDuration(g.minutes)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 rounded-lg border border-line bg-glass p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">{selected.clientName}</h2>
          <span className="font-semibold tabular-nums text-ink">{formatDuration(selected.minutes)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.projects.map((p) => (
            <div
              key={p.projectId}
              className="flex items-center gap-2 rounded-pill border border-line bg-glass px-3 py-1.5 text-sm"
            >
              <span className="text-muted">{p.projectTitle}</span>
              <span className="font-semibold tabular-nums text-ink">{formatDuration(p.minutes)}</span>
            </div>
          ))}
        </div>
        <div className="ds-scroll mt-4 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {selectedEntries.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-glass px-3 py-2 text-sm"
            >
              <span className="w-24 shrink-0 text-muted">{formatDay(e.spentOn)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{e.taskTitle}</span>
              {selected.projects.length > 1 && (
                <span className="shrink-0 text-xs text-muted">{e.projectTitle}</span>
              )}
              <span className="shrink-0 font-semibold tabular-nums text-ink">{formatDuration(e.minutes)}</span>
              {e.note && (
                <span className="w-full truncate text-xs text-muted sm:w-auto sm:flex-1">{e.note}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
