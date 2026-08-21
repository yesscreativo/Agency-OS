import { notFound, redirect } from "next/navigation";
import { getProject, listOrgUsers } from "@agency-os/db";
import { extractShortId, matchesShortId } from "@agency-os/domain";
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
import { NoAccessPanel } from "@/components/no-access-panel";

export const dynamic = "force-dynamic";

const PROJECT_STATE_BADGE = {
  active: { label: "Activo", tone: "info" as const },
  completed: { label: "Completado", tone: "success" as const },
  archived: { label: "Archivado", tone: "neutral" as const },
};

/** Resuelve el id del proyecto a partir del código corto del segmento de URL,
 * dentro de la organización del usuario. `work_items.id` es uuid: no se puede
 * filtrar por prefijo vía PostgREST, así que se traen los ids de proyectos de la
 * org (pocos) y se cotejan en memoria con `matchesShortId`. */
async function resolveProjectId(
  db: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  code: string,
): Promise<string | null> {
  const { data } = await db
    .from("work_items")
    .select("id")
    .eq("organization_id", orgId)
    .eq("type", "project")
    .is("deleted_at", null);
  return (data ?? []).find((r) => matchesShortId(r.id, code))?.id ?? null;
}

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
    ? await resolveProjectId(db, organizationId, extractShortId(params.proyecto))
    : null;
  if (!projectId) notFound();

  const project = await getProject(db, projectId);
  if (!project) notFound();

  // Ruta canónica; si la URL trae un slug viejo (renombre) redirige a la actual.
  const canonical = projectHref(project.client, project);
  if (`/proyectos/${params.cliente}/${params.proyecto}` !== canonical) redirect(canonical);

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
        basePath={canonical}
        statuses={statuses}
        tasks={tasks}
        orgUsers={orgUsers}
        canManage={hasPermission(user, "project.manage")}
        canAssign={hasPermission(user, "project.assign")}
      />
    </div>
  );
}
