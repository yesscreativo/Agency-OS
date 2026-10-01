"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button, Select } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPES, LEAVE_REQUEST_TYPE_LABELS } from "@agency-os/domain";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function ReportFilters({
  currentYear,
  basePath = "/rrhh/reportes",
  exportPath = "/rrhh/reportes/export",
}: {
  currentYear: number;
  /** Ruta de la página a la que apuntan los filtros (query params). */
  basePath?: string;
  /** Ruta del endpoint de export CSV. */
  exportPath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const year = searchParams.get("year") ?? String(currentYear);
  const month = searchParams.get("month") ?? "";
  const type = searchParams.get("type") ?? "";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${basePath}?${params.toString()}`);
  };

  const exportHref = `${exportPath}?${searchParams.toString()}`;

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted">Año</label>
        <Select value={year} onChange={(e) => setParam("year", e.target.value)}>
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Mes</label>
        <Select value={month} onChange={(e) => setParam("month", e.target.value)}>
          <option value="">Todos</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Tipo</label>
        <Select value={type} onChange={(e) => setParam("type", e.target.value)}>
          <option value="">Todos</option>
          {LEAVE_REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAVE_REQUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>
      <Button variant="ghost" size="sm" onClick={() => window.open(exportHref, "_blank")}>
        Exportar CSV
      </Button>
    </div>
  );
}
