import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getProject,
  listDependenciesForProject,
  listGanttTasks,
  listOrgUsers,
  resolveProjectByShortId,
  sumMinutesByProject,
  sumMinutesByTask,
} from "@agency-os/db";
import { extractShortId, formatDuration } from "@agency-os/domain";
import { Badge } from "@agency-os/ui";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { projectHref } from "@/lib/project-paths";
import {
  ProjectBoard,
  type BoardOrgUser,
  type BoardStatus,
  type BoardTask,
} from "@/components/proyectos/project-board";
import type { GanttTask } from "@/components/proyectos/gantt-task-modal";
import type { GanttDependency } from "@/components/proyectos/project-gantt";
import { NoAccessPanel } from "@/components/no-access-panel";
import { DeleteProjectButton } from "@/components/proyectos/delete-project-button";

export const dynamic = "force-dynamic";

const PROJECT_STATE_BADGE = {
  active: { label: "Activo", tone: "info" as const },
  completed: { label: "Completado", tone: "success" as const },
  archived: { label: "Archivado", tone: "neutral" as const },
};

export default async function ProjectDetailPage({
  params,
}: {
  params: { cliente: string; proyecto: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "proyectos") || !hasPermission(user, "project.view")) {
    return (
      <NoAccessPanel
        title="No tienes acceso a Proyectos"
        message="Tu rol no tiene permiso para ver este módulo. Si crees que deberías tener acceso, pídele a un administrador que te lo habilite."
      />
    );
  }

  const organizationId = user.organizationIds[0];
  const db = await getSupabaseServerClient();

  const projectId = organizationId
    ? await resolveProjectByShortId(db, organizationId, extractShortId(params.proyecto))
    : null;
  if (!projectId) notFound();

  // `getProject` y las tres consultas de abajo solo necesitan `projectId`
  // (ninguna depende del resultado de `getProject`) — corren en paralelo en
  // vez de esperar a que `getProject` termine primero.
  const [project, orgUserRows, projectMinutes, minutesByTask, ganttTaskRows, dependencyRows] = await Promise.all([
    getProject(db, projectId),
    organizationId ? listOrgUsers(db, organizationId) : Promise.resolve([]),
    sumMinutesByProject(db, projectId),
    sumMinutesByTask(db, projectId),
    projectId ? listGanttTasks(db, projectId) : Promise.resolve([]),
    projectId ? listDependenciesForProject(db, projectId) : Promise.resolve([]),
  ]);
  if (!project) notFound();

  // Ruta canónica; si la URL trae un slug viejo (renombre) redirige a la actual.
  const canonical = projectHref(project.client, project);
  if (`/proyectos/${params.cliente}/${params.proyecto}` !== canonical) redirect(canonical);

  const statuses: BoardStatus[] = project.statuses.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    isDone: s.is_done,
  }));

  // Lista plana (tareas + subtareas); el árbol se arma en el board vía parentId.
  const tasks: BoardTask[] = project.tasks.map((t) => ({
    id: t.id,
    parentId: t.parent_id,
    type: t.type === "subtask" ? "subtask" : "task",
    title: t.title,
    description: t.description,
    statusId: t.status_id,
    priority: t.priority,
    startDate: t.start_date,
    dueDate: t.due_date,
    assignees: t.assignees
      .filter((a) => a.users)
      .map((a) => ({
        id: a.user_id,
        name: a.users!.person?.full_name ?? a.users!.person?.email ?? "—",
      })),
  }));

  const orgUsers: BoardOrgUser[] = orgUserRows.map((u) => ({
    id: u.id,
    name: u.fullName,
    avatarUrl: u.avatarUrl,
  }));

  const ganttTasks: GanttTask[] = ganttTaskRows.map((t) => ({
    id: t.id,
    parentId: t.parent_id,
    title: t.title,
    statusId: t.status_id,
    startDate: t.start_date,
    dueDate: t.due_date,
    assigneeIds: t.assignees.map((a) => a.user_id),
    dependsOnIds: dependencyRows.filter((d) => d.work_item_id === t.id).map((d) => d.depends_on_work_item_id),
  }));
  const ganttDependencies: GanttDependency[] = dependencyRows.map((d) => ({
    id: d.id,
    workItemId: d.work_item_id,
    dependsOnWorkItemId: d.depends_on_work_item_id,
  }));

  const state = PROJECT_STATE_BADGE[project.project_state ?? "active"] ?? PROJECT_STATE_BADGE.active;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/proyectos" className="text-sm text-muted transition hover:text-ink">
            ← Proyectos
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
            <Badge tone={state.tone}>{state.label}</Badge>
            {projectMinutes > 0 && (
              <span className="text-sm text-muted">{formatDuration(projectMinutes)} registradas</span>
            )}
          </div>
          {project.client && (
            <p className="mt-1 text-sm text-muted">
              {project.client.name}
              {project.client.company ? ` · ${project.client.company}` : ""}
            </p>
          )}
        </div>
        {hasPermission(user, "project.manage") && <DeleteProjectButton projectId={project.id} />}
      </div>
      <ProjectBoard
        projectId={project.id}
        basePath={canonical}
        statuses={statuses}
        tasks={tasks}
        orgUsers={orgUsers}
        canManage={hasPermission(user, "project.manage")}
        canAssign={hasPermission(user, "project.assign")}
        minutesByTask={minutesByTask}
        ganttEnabled={project.gantt_enabled}
        ganttTasks={ganttTasks}
        ganttDependencies={ganttDependencies}
      />
    </div>
  );
}
