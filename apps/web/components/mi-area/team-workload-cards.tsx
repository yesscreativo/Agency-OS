// "Carga del equipo": una card por colaborador con tareas abiertas + tiempo de
// la semana. Presentacional, sin interacción — server component.

import { formatDuration } from "@agency-os/domain";

export interface TeamWorkloadPerson {
  id: string;
  fullName: string;
  openTasks: number;
  minutesThisWeek: number;
}

export function TeamWorkloadCards({ people }: { people: TeamWorkloadPerson[] }) {
  if (people.length === 0) {
    return <p className="mt-3 text-sm text-muted">Todavía no hay colaboradores en esta área.</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => (
        <div key={p.id} className="rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
          <div className="font-semibold text-ink">{p.fullName}</div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted">Tareas abiertas</span>
            <span className="font-semibold tabular-nums text-ink">{p.openTasks}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-muted">Esta semana</span>
            <span className="font-semibold tabular-nums text-ink">
              {p.minutesThisWeek > 0 ? formatDuration(p.minutesThisWeek) : "0m"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
