import { notFound, redirect } from "next/navigation";
import { getProject, listOrgUsers } from "@agency-os/db";
import { Badge } from "@agency-os/ui";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  ProjectBoard,
  type BoardOrgUser,
  type BoardStatus,
  type BoardTask,
} from "@/components/proyectos/project-board";

export const dynamic = "force-dynamic";

const PROJECT_STATE_BADGE = {
  active: { label: "Activo", tone: "info" as const },
  completed: { label: "Completado", tone: "success" as const },
  archived: { label: "Archivado", tone: "neutral" as const },
};

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "proyectos")) redirect("/inicio");
  if (!hasPermission(user, "project.view")) redirect("/inicio");

  const db = await getSupabaseServerClient();
  const project = await getProject(db, params.id);
  if (!project) notFound();

  const organizationId = user.organizationIds[0];
  const orgUserRows = organizationId ? await listOrgUsers(db, organizationId) : [];

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

  const orgUsers: BoardOrgUser[] = orgUserRows.map((u) => ({ id: u.id, name: u.fullName }));

  const state = PROJECT_STATE_BADGE[project.project_state ?? "active"] ?? PROJECT_STATE_BADGE.active;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <a href="/proyectos" className="text-sm text-muted transition hover:text-ink">
            ← Proyectos
          </a>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
          {project.client && (
            <p className="mt-1 text-sm text-muted">
              {project.client.name}
              {project.client.company ? ` · ${project.client.company}` : ""}
            </p>
          )}
        </div>
      </div>
      <ProjectBoard
        projectId={project.id}
        statuses={statuses}
        tasks={tasks}
        orgUsers={orgUsers}
        canManage={hasPermission(user, "project.manage")}
        canAssign={hasPermission(user, "project.assign")}
      />
    </div>
  );
}
