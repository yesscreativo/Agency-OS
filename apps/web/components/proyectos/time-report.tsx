// "Mis tiempos" (ClickUp Parity Fase C). Server component puro: el filtro de
// fechas es un <form method="get"> (sin JS). "Tiempos del equipo"/"Carga del
// equipo" se eliminó de aquí — ahora vive en /mi-area, con el alcance correcto
// (gerente del área, no cualquiera con project.manage).

import { Button, Input, Label } from "@agency-os/ui";
import { formatDuration } from "@agency-os/domain";
import { ClientTimeMasterDetail } from "./client-time-master-detail";

export interface TimeReportEntry {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
  minutes: number;
  spentOn: string;
  note: string | null;
}

interface TimeReportProps {
  entries: TimeReportEntry[];
  filters: { from: string; to: string };
}

export function TimeReport({ entries, filters }: TimeReportProps) {
  const totalMinutes = entries.reduce((n, e) => n + e.minutes, 0);
  const hasFilters = Boolean(filters.from || filters.to);

  return (
    <div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mis tiempos</h1>
        <p className="mt-1 text-sm text-muted">Tiempo que has registrado, por cliente.</p>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="tr-from">Desde</Label>
          <Input id="tr-from" type="date" name="from" defaultValue={filters.from} className="w-40" />
        </div>
        <div>
          <Label htmlFor="tr-to">Hasta</Label>
          <Input id="tr-to" type="date" name="to" defaultValue={filters.to} className="w-40" />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        {hasFilters && (
          <a href="/proyectos/tiempos" className="text-sm text-muted transition hover:text-ink">
            Limpiar filtros
          </a>
        )}
      </form>

      <div className="mt-6 rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="text-lg font-semibold tabular-nums text-ink">
            {totalMinutes > 0 ? formatDuration(totalMinutes) : "0m"}
          </span>
        </div>
      </div>

      <ClientTimeMasterDetail entries={entries} />
    </div>
  );
}
