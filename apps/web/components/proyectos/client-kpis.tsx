// Resumen (KPIs) de cómo está el cliente frente a sus tareas. Se muestra bajo el
// título en el space del cliente. Reusa el `KpiCard` del design system (mismo
// esquema visual que los KPIs de Cotizaciones): glass + icono tintado + número.

import { KpiCard, KpiDot } from "@agency-os/ui";

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const FolderIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);
const ListIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
const CheckCircleIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.2 2.4 2.4 4.6-5" />
  </svg>
);
const ClockIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

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

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard
        label="Proyectos"
        value={projectCount}
        hint={`${activeCount} activos`}
        icon={<FolderIcon />}
        tone="purple"
        highlight
      />
      <KpiCard label="Tareas" value={tasksTotal} icon={<ListIcon />} tone="neutral" />
      <KpiCard
        label="Completado"
        value={`${pct}%`}
        icon={<CheckCircleIcon />}
        tone="green"
        sub={
          <div className="flex items-center gap-2">
            <KpiDot tone="green" />
            <span className="font-mono text-[13px] text-muted">
              {tasksDone}/{tasksTotal} tareas
            </span>
          </div>
        }
      />
      <KpiCard label="En curso" value={tasksInProgress} icon={<ClockIcon />} tone="warn" />
    </div>
  );
}
