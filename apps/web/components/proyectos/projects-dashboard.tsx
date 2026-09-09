"use client";

// Dashboard de la raíz /proyectos: saludo + agenda semanal (lunes-viernes)
// ordenada por prioridad/duración estimada (heurística sin IA, ver
// packages/domain/src/agenda.ts). Vive arriba de <ProjectsList>, misma página.

import { Badge } from "@agency-os/ui";
import { formatDuration, type WorkItemPriority } from "@agency-os/domain";
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

export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
}) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {greeting}, {userName}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {todayCount} para hoy · {tomorrowCount} vencen mañana
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
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
    </div>
  );
}
