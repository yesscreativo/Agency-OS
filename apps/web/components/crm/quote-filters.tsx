"use client";

import { QUOTE_STATUSES } from "@agency-os/domain";
import { Input, Select } from "@agency-os/ui";
import { QUOTE_STATUS_LABELS } from "@/lib/quote-ui";

interface QuoteFiltersProps {
  q: string;
  kam: string;
  kams: { id: string; name: string }[];
  estado: string;
  desde: string;
  hasta: string;
  cerradas: boolean;
}

/** Barra de filtros de la lista — formulario GET, el estado vive en la URL. */
export function QuoteFilters({ q, kam, kams, estado, desde, hasta, cerradas }: QuoteFiltersProps) {
  return (
    <form
      method="GET"
      action="/crm"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-glass p-4 backdrop-blur-xl"
    >
      <div className="min-w-[220px] flex-1">
        <label htmlFor="f-q" className="mb-1.5 block text-xs font-semibold text-muted">
          Buscar
        </label>
        <Input
          id="f-q"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, cliente o ID…"
          className="py-2.5"
        />
      </div>
      <div className="w-[200px]">
        <label htmlFor="f-kam" className="mb-1.5 block text-xs font-semibold text-muted">
          KAM / PM
        </label>
        <Select id="f-kam" name="kam" defaultValue={kam} className="py-2.5">
          <option value="">Todas las KAM/PM</option>
          {kams.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-[180px]">
        <label htmlFor="f-estado" className="mb-1.5 block text-xs font-semibold text-muted">
          Estado
        </label>
        <Select id="f-estado" name="estado" defaultValue={estado} className="py-2.5">
          <option value="">Todos</option>
          {QUOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-[160px]">
        <label htmlFor="f-desde" className="mb-1.5 block text-xs font-semibold text-muted">
          Desde
        </label>
        <Input id="f-desde" name="desde" type="date" defaultValue={desde} className="py-2.5" />
      </div>
      <div className="w-[160px]">
        <label htmlFor="f-hasta" className="mb-1.5 block text-xs font-semibold text-muted">
          Hasta
        </label>
        <Input id="f-hasta" name="hasta" type="date" defaultValue={hasta} className="py-2.5" />
      </div>
      <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-muted">
        <input
          type="checkbox"
          name="cerradas"
          value="1"
          defaultChecked={cerradas}
          className="h-4 w-4 accent-[var(--green)]"
        />
        Incluir cerradas
      </label>
      <button
        type="submit"
        className="cursor-pointer rounded-pill bg-green px-5 py-2.5 text-sm font-semibold text-green-ink transition hover:brightness-105"
      >
        Filtrar
      </button>
      <a href="/crm" className="pb-2.5 text-sm text-muted transition hover:text-ink">
        Limpiar
      </a>
    </form>
  );
}
