"use client";

// Sección superior de campos del detalle de tarea, estilo ClickUp: filas
// compactas etiqueta→valor en 2 columnas, cada valor editable inline y con
// auto-guardado (sin botón). Reemplaza el formulario de inputs grandes anterior.
//
// Cada edición reenvía el ESTADO COMPLETO de la tarea a `saveWorkItem` (que
// reescribe todos los campos, incluida la descripción): por eso el panel recibe
// la tarea entera y hace merge con el campo que cambió. Los asignados van por
// `setWorkItemAssignees`. Ambas acciones ya registran actividad (Slice 1).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarGroup, Badge, Button, Input } from "@agency-os/ui";
import {
  dateRangeLabel,
  formatDuration,
  initialsOf,
  parseDuration,
  WORK_ITEM_PRIORITIES,
  type WorkItemPriority,
} from "@agency-os/domain";
import { saveWorkItem, setWorkItemAssignees } from "@/lib/project-actions";
import type { BoardStatus } from "./project-board";
import { AssigneeMultiSelect, PRIORITY_LABEL, PriorityBadge } from "./work-item-fields";

export interface FieldsPanelAssignee {
  id: string;
  name: string;
}

export interface FieldsPanelTask {
  id: string;
  title: string;
  description: string | null;
  statusId: string | null;
  priority: WorkItemPriority;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  assignees: FieldsPanelAssignee[];
}

/** Fila etiqueta→valor con icono. El valor se pinta con `children`. */
function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex w-36 shrink-0 items-center gap-2 text-[13px] text-muted">
        <span className="text-faint">{icon}</span>
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Envoltorio de edición inline: muestra `display`; al hacer clic (si `editable`)
 * abre `editor` en un popover que se cierra al hacer clic fuera o con Escape. */
function InlineEdit({
  editable,
  display,
  children,
}: {
  editable: boolean;
  display: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!editable) return <div className="text-sm text-ink">{display}</div>;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex w-full items-center rounded-md px-2 py-1 text-left text-sm text-ink transition hover:bg-surface-2"
      >
        {display}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border border-line bg-glass-strong p-3 shadow-overlay backdrop-blur-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const EMPTY = <span className="text-faint">Vacío</span>;

export function WorkItemFieldsPanel({
  projectId,
  task,
  statuses,
  orgUsers,
  canManage,
  canAssign,
}: {
  projectId: string;
  task: FieldsPanelTask;
  statuses: BoardStatus[];
  orgUsers: FieldsPanelAssignee[];
  canManage: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Estado local para edición de duración (input libre), asignados y los campos
  // que se editan por popover (estado/prioridad). Estos últimos se pintan de
  // forma OPTIMISTA: al elegir se ven al instante, sin esperar al `router.refresh`.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assignees.map((a) => a.id));
  const [estimateInput, setEstimateInput] = useState(formatDuration(task.estimatedMinutes));
  const [statusIdLocal, setStatusIdLocal] = useState(task.statusId);
  const [priorityLocal, setPriorityLocal] = useState(task.priority);

  // Re-sincroniza si el server manda datos nuevos tras un refresh.
  useEffect(() => {
    setAssigneeIds(task.assignees.map((a) => a.id));
    setEstimateInput(formatDuration(task.estimatedMinutes));
    setStatusIdLocal(task.statusId);
    setPriorityLocal(task.priority);
  }, [task.assignees, task.estimatedMinutes, task.statusId, task.priority]);

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const currentStatus = statusIdLocal ? statusById.get(statusIdLocal) : null;

  /** Guarda reenviando el estado completo + los overrides del campo editado.
   * Parte de los valores LOCALES (estado/prioridad optimistas) para que dos
   * ediciones rápidas seguidas no se pisen con un `task` aún sin refrescar. */
  const save = (overrides: Partial<FieldsPanelTask>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const merged = { ...task, statusId: statusIdLocal, priority: priorityLocal, ...overrides };
      const res = await saveWorkItem({
        id: task.id,
        projectId,
        title: merged.title,
        description: merged.description,
        statusId: merged.statusId,
        priority: merged.priority,
        startDate: merged.startDate,
        dueDate: merged.dueDate,
        estimatedMinutes: merged.estimatedMinutes,
      });
      if (res.error) setError(res.error);
      else {
        onDone?.();
        router.refresh();
      }
    });
  };

  const saveAssignees = (ids: string[]) => {
    setError(null);
    startTransition(async () => {
      const res = await setWorkItemAssignees(task.id, ids);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const commitEstimate = (close: () => void) => {
    const parsed = parseDuration(estimateInput);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    close();
    save({ estimatedMinutes: parsed.minutes });
  };

  return (
    <section
      className="relative z-30 rounded-lg border border-line bg-glass px-6 py-3 backdrop-blur-xl"
      aria-busy={isPending}
    >
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {/* Estado */}
        <Row icon={<IconStatus />} label="Estado">
          <InlineEdit
            editable={canManage}
            display={
              currentStatus ? (
                <Badge color={currentStatus.color}>{currentStatus.label}</Badge>
              ) : (
                EMPTY
              )
            }
          >
            {(close) => (
              <div className="flex flex-col gap-1">
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.id === statusIdLocal) return close();
                      setStatusIdLocal(s.id);
                      close();
                      save({ statusId: s.id });
                    }}
                    className="flex items-center rounded-md px-2 py-1.5 text-left transition hover:bg-surface-2"
                  >
                    <Badge color={s.color}>{s.label}</Badge>
                  </button>
                ))}
              </div>
            )}
          </InlineEdit>
        </Row>

        {/* Prioridad */}
        <Row icon={<IconFlag />} label="Prioridad">
          <InlineEdit editable={canManage} display={<PriorityBadge priority={priorityLocal} />}>
            {(close) => (
              <div className="flex flex-col gap-1">
                {WORK_ITEM_PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      if (p === priorityLocal) return close();
                      setPriorityLocal(p);
                      close();
                      save({ priority: p });
                    }}
                    className="flex items-center rounded-md px-2 py-1.5 text-left transition hover:bg-surface-2"
                  >
                    <PriorityBadge priority={p} />
                    <span className="ml-2 text-sm text-muted">{PRIORITY_LABEL[p]}</span>
                  </button>
                ))}
              </div>
            )}
          </InlineEdit>
        </Row>

        {/* Fechas */}
        <Row icon={<IconCalendar />} label="Fechas">
          <InlineEdit
            editable={canManage}
            display={
              task.startDate || task.dueDate ? (
                <span>{dateRangeLabel(task.startDate, task.dueDate)}</span>
              ) : (
                EMPTY
              )
            }
          >
            {(close) => (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted">
                  Inicio
                  <Input
                    type="date"
                    defaultValue={task.startDate ?? ""}
                    onChange={(e) => save({ startDate: e.target.value || null })}
                  />
                </label>
                <label className="text-xs text-muted">
                  Vence
                  <Input
                    type="date"
                    defaultValue={task.dueDate ?? ""}
                    onChange={(e) => save({ dueDate: e.target.value || null })}
                  />
                </label>
                <Button variant="ghost" size="sm" onClick={close}>
                  Listo
                </Button>
              </div>
            )}
          </InlineEdit>
        </Row>

        {/* Asignados */}
        <Row icon={<IconUser />} label="Asignados">
          <InlineEdit
            editable={canAssign}
            display={
              task.assignees.length > 0 ? (
                <AvatarGroup more={task.assignees.length > 3 ? task.assignees.length - 3 : undefined}>
                  {task.assignees.slice(0, 3).map((a) => (
                    <Avatar key={a.id} initials={initialsOf(a.name)} size="xs" title={a.name} />
                  ))}
                </AvatarGroup>
              ) : (
                <span className="text-faint">+ Asignar</span>
              )
            }
          >
            {() => (
              <div className="w-64">
                <AssigneeMultiSelect
                  users={orgUsers}
                  selectedIds={assigneeIds}
                  onToggle={(uid) => {
                    const next = assigneeIds.includes(uid)
                      ? assigneeIds.filter((x) => x !== uid)
                      : [...assigneeIds, uid];
                    setAssigneeIds(next);
                    saveAssignees(next);
                  }}
                  disabled={false}
                />
              </div>
            )}
          </InlineEdit>
        </Row>

        {/* Duración estimada */}
        <Row icon={<IconClock />} label="Duración estimada">
          <InlineEdit
            editable={canManage}
            display={
              task.estimatedMinutes ? <span>{formatDuration(task.estimatedMinutes)}</span> : EMPTY
            }
          >
            {(close) => (
              <div className="flex flex-col gap-2">
                <Input
                  autoFocus
                  value={estimateInput}
                  onChange={(e) => setEstimateInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && commitEstimate(close)}
                  placeholder="p. ej. 2h, 90m, 1h 30m"
                />
                <Button variant="primary" size="sm" onClick={() => commitEstimate(close)}>
                  Guardar
                </Button>
              </div>
            )}
          </InlineEdit>
        </Row>

        {/* Etiquetas (placeholder para slice de tags) */}
        <Row icon={<IconTag />} label="Etiquetas">
          <span className="text-sm text-faint">Vacío</span>
        </Row>

        {/* Registrar el tiempo (placeholder para slice de time tracking) */}
        <Row icon={<IconTimer />} label="Registrar el tiempo">
          <span className="text-sm text-faint">Vacío</span>
        </Row>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </section>
  );
}

/* Iconos SVG inline (16px), minimalistas para acompañar cada etiqueta. */
const iconProps = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const IconStatus = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
  </svg>
);
const IconFlag = () => (
  <svg {...iconProps}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);
const IconCalendar = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconUser = () => (
  <svg {...iconProps}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconClock = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);
const IconTag = () => (
  <svg {...iconProps}>
    <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const IconTimer = () => (
  <svg {...iconProps}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
