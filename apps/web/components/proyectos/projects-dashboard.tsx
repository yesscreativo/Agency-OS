"use client";

// Dashboard de la raíz /proyectos: saludo + agenda semanal (lunes-viernes)
// ordenada por prioridad/duración estimada (heurística sin IA, ver
// packages/domain/src/agenda.ts). Vive arriba de <ProjectsList>, misma página.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Input } from "@agency-os/ui";
import { formatDuration, type WorkItemPriority } from "@agency-os/domain";
import { saveWorkItem } from "@/lib/project-actions";
import { PriorityBadge } from "./work-item-fields";

export interface AgendaTaskView {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  statusId: string | null;
  startDate: string | null;
  priority: WorkItemPriority;
  dueDate: string | null;
  estimatedMinutes: number | null;
  projectTitle: string;
  clientName: string | null;
  href: string;
}

export interface AgendaDay {
  date: string;
  label: string;
  tasks: AgendaTaskView[];
}

function AgendaCard({ task, overdue }: { task: AgendaTaskView; overdue?: boolean }) {
  return (
    <a
      href={task.href}
      className="block rounded-md border border-line bg-surface-2 p-2.5 text-sm transition hover:border-line-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-ink">{task.title}</span>
        {overdue && <Badge tone="danger">Retrasada</Badge>}
      </div>
      <div className="mt-1 truncate text-xs text-muted">
        {task.clientName ?? "—"} · {task.projectTitle}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {task.estimatedMinutes !== null && (
          <span className="font-mono text-[11px] text-muted">
            {formatDuration(task.estimatedMinutes)}
          </span>
        )}
      </div>
    </a>
  );
}

function UndatedRow({ task, onSaved }: { task: AgendaTaskView; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onChangeDate = (dueDate: string) => {
    if (!dueDate) return;
    setError(null);
    startTransition(async () => {
      const res = await saveWorkItem({
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        statusId: task.statusId,
        priority: task.priority,
        startDate: task.startDate,
        dueDate,
        estimatedMinutes: task.estimatedMinutes,
      });
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="rounded-md border border-line bg-surface-2 p-2.5 text-sm">
      <a href={task.href} className="block truncate font-medium text-ink hover:underline">
        {task.title}
      </a>
      <div className="mt-1 truncate text-xs text-muted">
        {task.clientName ?? "—"} · {task.projectTitle}
      </div>
      <div className="mt-1.5">
        <Input
          type="date"
          disabled={isPending}
          onChange={(e) => onChangeDate(e.target.value)}
          aria-label={`Asignar fecha a "${task.title}"`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export interface TeamLoadSummary {
  overloadedCount: number;
  totalCount: number;
}

export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
  undatedTasks,
  canEdit,
  teamLoad,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
  undatedTasks: AgendaTaskView[];
  canEdit: boolean;
  teamLoad: TeamLoadSummary | null;
}) {
  const router = useRouter();
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {greeting}, {userName}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {todayCount} para hoy · {tomorrowCount} vencen mañana
      </p>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-5">
          {days.map((day) => {
            const isToday = day.date === today;
            const tasks = isToday ? [...overdueTasks, ...day.tasks] : day.tasks;
            return (
              <div key={day.date} className="rounded-lg border border-line bg-glass p-3 backdrop-blur-xl">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {day.label}
                </div>
                <div className="mt-2 space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-faint">Sin tareas.</p>
                  ) : (
                    tasks.map((t) => (
                      <AgendaCard key={t.id} task={t} overdue={isToday && overdueTasks.includes(t)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="rounded-lg border border-line bg-glass p-3 backdrop-blur-xl lg:w-[260px]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Sin fecha · {undatedTasks.length}
            </div>
            <div className="mt-2 space-y-2">
              {undatedTasks.length === 0 ? (
                <p className="text-xs text-faint">Todo tiene fecha.</p>
              ) : (
                undatedTasks.map((t) => (
                  <UndatedRow key={t.id} task={t} onSaved={() => router.refresh()} />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
        <h2 className="font-semibold text-ink">Atención</h2>
        <p className="mt-1 text-sm text-muted">
          {overdueTasks.length === 0
            ? "Sin tareas vencidas."
            : `${overdueTasks.length} tarea${overdueTasks.length === 1 ? "" : "s"} vencida${overdueTasks.length === 1 ? "" : "s"}.`}
        </p>
        {teamLoad && (
          <p className="mt-1 text-sm text-muted">
            {teamLoad.overloadedCount === 0
              ? "Tu equipo está al día."
              : `${teamLoad.overloadedCount} persona${teamLoad.overloadedCount === 1 ? "" : "s"} con más de 5 tareas abiertas.`}{" "}
            <a href="/mi-area" className="text-ink underline hover:no-underline">
              Ver Mi área
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
