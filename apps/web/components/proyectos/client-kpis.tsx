// Resumen (KPIs) de cómo está el cliente frente a sus tareas. Se muestra bajo el
// título en el space del cliente. Presentacional: los agregados se calculan en el
// server (page del cliente) a partir de listProjects.

interface Kpi {
  label: string;
  value: string;
  hint?: string;
}

function Tile({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-lg border border-line bg-glass px-4 py-3 backdrop-blur-xl">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{kpi.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{kpi.value}</span>
        {kpi.hint && <span className="text-xs text-muted">{kpi.hint}</span>}
      </div>
    </div>
  );
}

export function ClientKpis({
  projectCount,
  activeCount,
  tasksTotal,
  tasksDone,
  tasksInProgress,
}: {
  projectCount: number;
  activeCount: number;
  tasksTotal: number;
  tasksDone: number;
  tasksInProgress: number;
}) {
  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  const kpis: Kpi[] = [
    { label: "Proyectos", value: String(projectCount), hint: `${activeCount} activos` },
    { label: "Tareas", value: String(tasksTotal) },
    { label: "Completado", value: `${pct}%`, hint: `${tasksDone}/${tasksTotal}` },
    { label: "En curso", value: String(tasksInProgress) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((k) => (
        <Tile key={k.label} kpi={k} />
      ))}
      {/* Barra de progreso general del cliente */}
      <div className="col-span-2 sm:col-span-4">
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
          <div className="h-full rounded-pill bg-green transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
