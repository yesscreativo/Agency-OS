import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getWorkItem,
  listActivity,
  listComments,
  listOrgUsers,
  listTimeEntries,
  resolveProjectByShortId,
  resolveTaskByShortId,
} from "@agency-os/db";
import { extractShortId } from "@agency-os/domain";
import { Badge } from "@agency-os/ui";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { listCommentAttachmentsForWorkItem, listWorkItemAttachments } from "@/lib/project-actions";
import { getActiveTimerAction } from "@/lib/time-tracking-actions";
import { NoAccessPanel } from "@/components/no-access-panel";
import {
  WorkItemDetail,
  type DetailSubtask,
  type DetailTask,
} from "@/components/proyectos/work-item-detail";
import type { BoardStatus } from "@/components/proyectos/project-board";

export const dynamic = "force-dynamic";

function assigneeName(a: {
  users: { person: { full_name: string | null; email: string | null } | null } | null;
}): string {
  return a.users?.person?.full_name ?? a.users?.person?.email ?? "—";
}

export default async function WorkItemDetailPage({
  params,
}: {
  params: { cliente: string; proyecto: string; tarea: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Sin acceso: mensaje claro (mismo panel que el layout) en vez de rebotar. Esto
  // hace que el enlace de una notificación de mención muestre un motivo, no un
  // redirect silencioso a /inicio.
  if (!canAccessModule(user, "proyectos") || !hasPermission(user, "project.view")) {
    return (
      <NoAccessPanel
        title="No tienes acceso a esta tarea"
        message="Tu rol no tiene permiso para ver Proyectos. Si crees que deberías poder abrir esta tarea, pídele a un administrador que te habilite el acceso."
      />
    );
  }

  const organizationId = user.organizationIds[0];
  const db = await getSupabaseServerClient();

  // Resolver el proyecto por el código corto del segmento (dentro de la org).
  const projectId = organizationId
    ? await resolveProjectByShortId(db, organizationId, extractShortId(params.proyecto))
    : null;
  if (!projectId) notFound();

  // Resolver la tarea por su código corto, acotando a ese proyecto.
  const taskId = await resolveTaskByShortId(db, projectId, extractShortId(params.tarea));
  if (!taskId) notFound();

  // Todo lo de abajo depende solo de taskId/projectId/organizationId, no entre
  // sí (ninguna necesita el `task` completo) — antes se esperaba en secuencia
  // (7+ round-trips uno detrás del otro), ahora corre en paralelo.
  const [
    task,
    orgUserRows,
    attachmentsResult,
    statusRows,
    commentRows,
    activityRows,
    commentAttachmentsResult,
    timeEntryRows,
    activeTimer,
  ] = await Promise.all([
    getWorkItem(db, taskId),
    organizationId ? listOrgUsers(db, organizationId) : Promise.resolve([]),
    listWorkItemAttachments(taskId),
    // `getWorkItem` no trae las columnas del tablero; se consultan aparte para
    // el selector de Estado.
    (async () => {
      const { data } = await db
        .from("work_item_statuses")
        .select("id, label, color, is_done")
        .eq("project_id", projectId)
        .order("sort_order");
      return data ?? [];
    })(),
    listComments(db, taskId),
    listActivity(db, taskId),
    listCommentAttachmentsForWorkItem(taskId),
    listTimeEntries(db, taskId),
    getActiveTimerAction(),
  ]);
  if (!task || task.organization_id !== organizationId || task.project_id !== projectId) {
    notFound();
  }

  const attachments =
    "attachments" in attachmentsResult && attachmentsResult.attachments
      ? attachmentsResult.attachments
      : [];

  const boardStatuses: BoardStatus[] = statusRows.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    isDone: s.is_done,
  }));

  const detailTask: DetailTask = {
    id: task.id,
    type: task.type === "subtask" ? "subtask" : "task",
    title: task.title,
    description: task.description,
    statusId: task.status_id,
    priority: task.priority,
    startDate: task.start_date,
    dueDate: task.due_date,
    estimatedMinutes: task.estimated_minutes,
    assignees: task.assignees
      .filter((a) => a.users)
      .map((a) => ({ id: a.user_id, name: assigneeName(a) })),
  };

  const subtasks: DetailSubtask[] = task.subtasks.map((st) => ({
    id: st.id,
    title: st.title,
    priority: st.priority,
    statusId: st.status_id,
  }));

  const orgUsers = orgUserRows.map((u) => ({ id: u.id, name: u.fullName, avatarUrl: u.avatarUrl }));

  const commentAttachments =
    "attachments" in commentAttachmentsResult && commentAttachmentsResult.attachments
      ? commentAttachmentsResult.attachments
      : [];
  const attachmentsByComment = new Map<string, typeof commentAttachments>();
  for (const a of commentAttachments) {
    const list = attachmentsByComment.get(a.commentId) ?? [];
    list.push(a);
    attachmentsByComment.set(a.commentId, list);
  }
  const comments = commentRows.map((c) => ({
    id: c.id,
    parentId: c.parent_comment_id,
    authorId: c.author_user_id,
    authorName: c.author?.full_name ?? "—",
    body: c.body,
    createdAt: c.created_at,
    editedAt: c.edited_at,
    attachments: attachmentsByComment.get(c.id) ?? [],
  }));
  const activity = activityRows.map((a) => ({
    id: a.id,
    eventType: a.event_type,
    actorId: a.actor?.id ?? null,
    actorName: a.actor?.full_name ?? null,
    actorAvatarUrl: a.actor?.avatar_url
      ? (db.storage.from("user-avatars").getPublicUrl(a.actor.avatar_url).data.publicUrl ?? null)
      : null,
    payload: (a.payload ?? {}) as Record<string, unknown>,
    createdAt: a.created_at,
  }));
  const timeEntries = timeEntryRows.map((e) => ({
    id: e.id,
    userId: e.user_id,
    userName: e.user?.full_name ?? "—",
    userAvatarUrl: e.user?.avatar_url ?? null,
    minutes: e.minutes,
    spentOn: e.spent_on,
    note: e.note,
    source: e.source,
  }));

  // Base canónica del proyecto: se reusa el segmento tal cual vino en la URL
  // (cosmético + código); breadcrumb y subtareas cuelgan de aquí.
  const projectPath = `/proyectos/${params.cliente}/${params.proyecto}`;

  return (
    <div>
      <div className="mb-4">
        <Link href={projectPath} className="text-sm text-muted transition hover:text-ink">
          ← {task.project?.title ?? "Proyecto"}
        </Link>
        {detailTask.type === "subtask" && (
          <Badge tone="neutral" className="ml-3 align-middle">
            Subtarea
          </Badge>
        )}
      </div>

      <WorkItemDetail
        projectId={projectId}
        projectPath={projectPath}
        task={detailTask}
        subtasks={subtasks}
        statuses={boardStatuses}
        orgUsers={orgUsers}
        canManage={hasPermission(user, "project.manage")}
        canAssign={hasPermission(user, "project.assign")}
        initialAttachments={attachments}
        currentUserId={user.id}
        comments={comments}
        activity={activity}
        timeEntries={timeEntries}
        activeTimer={activeTimer}
      />
    </div>
  );
}
