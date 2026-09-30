"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarGroup, Button } from "@agency-os/ui";
import { barWidthDays, dayOffset, monthSegments } from "@agency-os/domain";
import { updateGanttTaskDatesAction } from "@/lib/gantt-actions";
import { GanttTaskModal, type GanttTask } from "./gantt-task-modal";
import type { BoardOrgUser, BoardStatus } from "./project-board";

const PX_PER_DAY = 10;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 32;

export interface GanttDependency {
  id: string;
  workItemId: string;
  dependsOnWorkItemId: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Iniciales para el avatar (mismo criterio que `project-board.tsx`). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

type DragMode = "move" | "resize-start" | "resize-end";

export function ProjectGantt({
  projectId,
  tasks,
  statuses,
  orgUsers,
  canManage,
}: {
  projectId: string;
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  statuses: BoardStatus[];
  orgUsers: BoardOrgUser[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<GanttTask | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const dragState = useRef<{
    id: string;
    mode: DragMode;
    startX: number;
    originalStart: string;
    originalDue: string;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; startDate: string; dueDate: string } | null>(null);
  // `mouseup` corre en el mismo listener creado en `mousedown`, así que lee un
  // `dragPreview` (state) congelado en el valor de ESE render — nunca ve las
  // actualizaciones que `mousemove` fue disparando. Se necesita un ref en
  // paralelo al state (el state es solo para pintar la barra en cada frame).
  const latestPreviewRef = useRef<{ id: string; startDate: string; dueDate: string } | null>(null);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const avatarByUserId = useMemo(
    () => new Map(orgUsers.map((u) => [u.id, { name: u.name, avatarUrl: u.avatarUrl ?? null }])),
    [orgUsers],
  );

  const dated = tasks.filter((t) => t.startDate && t.dueDate);
  const rangeStart =
    dated.length > 0 ? dated.reduce((min, t) => (t.startDate! < min ? t.startDate! : min), dated[0]!.startDate!) : null;
  const rangeEnd =
    dated.length > 0 ? dated.reduce((max, t) => (t.dueDate! > max ? t.dueDate! : max), dated[0]!.dueDate!) : null;
  // Header de meses calendario completos + punto cero para posicionar las
  // barras (`gridStart` = primer día del primer mes, no la fecha exacta de la
  // tarea más temprana) — así header y barras quedan alineados.
  const segments = rangeStart && rangeEnd ? monthSegments(rangeStart, rangeEnd) : [];
  const gridStart = segments[0]?.startIso ?? null;
  const gridWidth = segments.reduce((sum, s) => sum + s.days, 0) * PX_PER_DAY;

  const topTasks = tasks.filter((t) => !t.parentId);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, GanttTask[]>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      (map.get(t.parentId) ?? map.set(t.parentId, []).get(t.parentId)!).push(t);
    }
    return map;
  }, [tasks]);

  const orderedRows: { task: GanttTask; depth: number }[] = [];
  for (const t of topTasks) {
    orderedRows.push({ task: t, depth: 0 });
    for (const child of childrenByParent.get(t.id) ?? []) orderedRows.push({ task: child, depth: 1 });
  }

  const commitDates = async (id: string, startDate: string, dueDate: string) => {
    const result = await updateGanttTaskDatesAction(id, startDate, dueDate);
    if (result.error) {
      // La mutación falló: no hay fecha nueva que esperar, se descarta el preview ya.
      setDragPreview(null);
      setError(result.error);
      return;
    }
    // OJO: no limpiar `dragPreview` acá. `router.refresh()` no espera a que el
    // Server Component vuelva a renderizar con la fecha nueva — si lo
    // limpiáramos ahora, la barra cae un frame a `task.startDate/dueDate`
    // (todavía la prop vieja) y después salta a la nueva cuando llega el
    // refresh: exactamente el parpadeo "vuelve a la fecha anterior y luego a
    // la nueva" reportado. El preview se limpia solo, más abajo, recién
    // cuando `tasks` (prop fresca) confirma la fecha nueva — mismo patrón que
    // el overlay de `statusById` en project-board.tsx.
    router.refresh();
  };

  // Una vez que `tasks` (prop fresca, tras el `router.refresh()` de arriba)
  // confirma la fecha nueva de la tarea arrastrada, soltamos el preview: ya no
  // hace falta y así no queda una sombra permanente tapando futuros arrastres
  // de esa misma tarea.
  useEffect(() => {
    if (!dragPreview) return;
    const fresh = tasks.find((t) => t.id === dragPreview.id);
    if (fresh && fresh.startDate === dragPreview.startDate && fresh.dueDate === dragPreview.dueDate) {
      setDragPreview(null);
    }
  }, [tasks, dragPreview]);

  const onBarMouseDown = (task: GanttTask, mode: DragMode) => (e: React.MouseEvent) => {
    if (!canManage || !task.startDate || !task.dueDate) return;
    e.preventDefault();
    dragState.current = {
      id: task.id,
      mode,
      startX: e.clientX,
      originalStart: task.startDate,
      originalDue: task.dueDate,
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;
      const deltaDays = Math.round((moveEvent.clientX - state.startX) / PX_PER_DAY);
      let nextStart = state.originalStart;
      let nextDue = state.originalDue;
      if (state.mode === "move") {
        nextStart = addDaysIso(state.originalStart, deltaDays);
        nextDue = addDaysIso(state.originalDue, deltaDays);
      } else if (state.mode === "resize-start") {
        nextStart = addDaysIso(state.originalStart, deltaDays);
        if (nextStart > nextDue) nextStart = nextDue;
      } else {
        nextDue = addDaysIso(state.originalDue, deltaDays);
        if (nextDue < nextStart) nextDue = nextStart;
      }
      const next = { id: state.id, startDate: nextStart, dueDate: nextDue };
      latestPreviewRef.current = next;
      setDragPreview(next);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const state = dragState.current;
      dragState.current = null;
      if (!state) return;
      const preview = latestPreviewRef.current;
      latestPreviewRef.current = null;
      if (preview && preview.id === state.id) {
        void commitDates(state.id, preview.startDate, preview.dueDate);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!gridStart) {
    return (
      <div className="rounded-lg border border-line bg-glass p-6 text-center text-sm text-muted backdrop-blur-xl">
        Todavía no hay tareas en el Gantt.
        {canManage && (
          <div className="mt-3">
            <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
              + Agregar tarea
            </Button>
          </div>
        )}
        {editing !== null && (
          <GanttTaskModal
            open
            onClose={() => setEditing(null)}
            projectId={projectId}
            statuses={statuses}
            orgUsers={orgUsers}
            otherTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
            task={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}

      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
            + Agregar tarea
          </Button>
        </div>
      )}

      <div className="ds-scroll flex overflow-x-auto rounded-lg border border-line bg-glass backdrop-blur-xl">
        <div className="w-[300px] shrink-0 border-r border-line">
          {/* Spacer para alinear las filas con las barras, que empiezan
              debajo del header de meses del panel derecho. */}
          <div style={{ height: HEADER_HEIGHT }} className="border-b border-line" />
          {orderedRows.map(({ task, depth }) => (
            <div
              key={task.id}
              style={{ height: ROW_HEIGHT, paddingLeft: 12 + depth * 28 }}
              className="flex cursor-pointer flex-col justify-center gap-1 border-b border-line py-2 pr-3 hover:bg-glass"
              onClick={() => setEditing(task)}
            >
              <div className="flex items-center gap-2">
                {depth > 0 && <span className="shrink-0 text-faint">↳</span>}
                <span
                  className={`truncate ${
                    depth > 0 ? "text-[12px] font-semibold text-muted" : "text-[13px] font-bold text-ink"
                  }`}
                >
                  {task.title}
                </span>
                {task.assigneeIds.length > 0 && (
                  <AvatarGroup>
                    {task.assigneeIds.slice(0, 3).map((id) => {
                      const info = avatarByUserId.get(id);
                      return (
                        <Avatar key={id} size="xs" initials={initialsOf(info?.name ?? "—")} src={info?.avatarUrl} />
                      );
                    })}
                  </AvatarGroup>
                )}
              </div>
              <span className="text-[11px] text-muted">
                {task.startDate ?? "—"} · {task.dueDate ?? "—"}
              </span>
            </div>
          ))}
        </div>

        <div>
          {/* Header: un mes calendario completo por segmento, ancho
              proporcional a sus días — mismo punto cero (`gridStart`) que las
              barras de abajo, para que quede todo alineado. */}
          <div className="flex" style={{ height: HEADER_HEIGHT }}>
            {segments.map((seg) => (
              <div
                key={seg.startIso}
                style={{ width: seg.days * PX_PER_DAY }}
                className="flex shrink-0 items-center justify-center border-b border-r border-line text-xs font-semibold text-muted"
              >
                {seg.label}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: orderedRows.length * ROW_HEIGHT, width: gridWidth }}>
            {/* Líneas verticales de la cuadrícula, un divisor por mes. */}
            <div className="absolute inset-0 flex">
              {segments.map((seg) => (
                <div
                  key={seg.startIso}
                  style={{ width: seg.days * PX_PER_DAY }}
                  className="h-full shrink-0 border-r border-line/40"
                />
              ))}
            </div>
            {orderedRows.map(({ task }, index) => {
              const preview = dragPreview?.id === task.id ? dragPreview : null;
              const startDate = preview?.startDate ?? task.startDate;
              const dueDate = preview?.dueDate ?? task.dueDate;
              if (!startDate || !dueDate) return null;
              const status = task.statusId ? statusById.get(task.statusId) : null;
              const left = dayOffset(gridStart, startDate) * PX_PER_DAY;
              const width = barWidthDays(startDate, dueDate) * PX_PER_DAY;
              return (
              <div
                key={task.id}
                className={`absolute flex items-center rounded-md px-2 text-xs font-semibold text-white ${
                  canManage ? "cursor-grab active:cursor-grabbing" : ""
                }`}
                style={{
                  left,
                  width,
                  top: index * ROW_HEIGHT + 6,
                  height: ROW_HEIGHT - 12,
                  backgroundColor: status?.color ?? "#9aa1ab",
                }}
                onMouseDown={onBarMouseDown(task, "move")}
                title={`${barWidthDays(startDate, dueDate)} días`}
              >
                {canManage && (
                  <div
                    className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onBarMouseDown(task, "resize-start")(e);
                    }}
                  />
                )}
                <span className="truncate">{task.title}</span>
                {canManage && (
                  <div
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onBarMouseDown(task, "resize-end")(e);
                    }}
                  />
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {editing !== null && (
        <GanttTaskModal
          open
          onClose={() => setEditing(null)}
          projectId={projectId}
          statuses={statuses}
          orgUsers={orgUsers}
          otherTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
          task={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
