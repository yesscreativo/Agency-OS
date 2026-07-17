/** Iconos de trazo para las tarjetas de módulo de la landing (heredan currentColor).
 * Sin librería de iconos en el repo — SVGs inline, patrón de kpi-icons.tsx. */

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function CrmIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 5h16v11H4z" />
      <path d="M8 20h8" />
      <path d="M7 9h6" />
      <path d="M7 12.5h4" />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function TicketsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
      <path d="M14 6v12" />
    </svg>
  );
}

function RrhhIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20a5 5 0 0 1 10 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17 20a5 5 0 0 0-2.5-4.3" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 5v14h14" />
      <path d="M8 15l3-4 3 2 4-6" />
    </svg>
  );
}

function ConfigIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7l2.1 1.2M17.7 15.8 19.8 17M4.2 17l2.1-1.2M17.7 8.2 19.8 7" />
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

const ICONS: Record<string, () => React.ReactNode> = {
  crm: CrmIcon,
  proyectos: ProjectsIcon,
  tickets: TicketsIcon,
  rrhh: RrhhIcon,
  reportes: ReportsIcon,
  configuracion: ConfigIcon,
};

export function ModuleIcon({ code }: { code: string | null }) {
  const Icon = (code && ICONS[code]) || DefaultIcon;
  return <Icon />;
}
