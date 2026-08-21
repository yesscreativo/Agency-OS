import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getWorkItem, listActivity, listComments, listOrgUsers } from "@agency-os/db";
import { extractShortId, matchesShortId } from "@agency-os/domain";
import { Badge } from "@agency-os/ui";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { listWorkItemAttachments } from "@/lib/project-actions";
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
  if (!canAccessModule(user, "proyectos")) redirect("/inicio");
  if (!hasPermission(user, "project.view")) redirect("/inicio");

  const organizationId = user.organizationIds[0];
  const db = await getSupabaseServerClient();

  // Resolver el proyecto por el código corto del segmento (dentro de la org).
  const { data: projRows } = organizationId
    ? await db
        .from("work_items")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("type", "project")
        .is("deleted_at", null)
    : { data: [] as { id: string }[] };
  const projectId = (projRows ?? []).find((r) =>
    matchesShortId(r.id, extractShortId(params.proyecto)),
  )?.id;
  if (!projectId) notFound();

  // Resolver la tarea por su código corto, acotando a ese proyecto.
  const { data: taskRows } = await db
    .from("work_items")
    .select("id")
    .eq("project_id", projectId)
    .in("type", ["task", "subtask"])
    .is("deleted_at", null);
  const taskId = (taskRows ?? []).find((r) => matchesShortId(r.id, extractShortId(params.tarea)))
    ?.id;
  if (!taskId) notFound();

  const task = await getWorkItem(db, taskId);
  if (!task || task.organization_id !== organizationId || task.project_id !== projectId) {
    notFound();
  }

  const orgUserRows = organizationId ? await listOrgUsers(db, organizationId) : [];
  const attachmentsResult = await listWorkItemAttachments(taskId);
  const attachments =
    "attachments" in attachmentsResult && attachmentsResult.attachments
      ? attachmentsResult.attachments
      : [];

  // `getWorkItem` no trae las columnas del tablero; se consultan aquí para el
  // selector de Estado.
  const { data: statusRows } = await db
    .from("work_item_statuses")
    .select("id, label, color, is_done")
    .eq("project_id", projectId)
    .order("sort_order");
  const boardStatuses: BoardStatus[] = (statusRows ?? []).map((s) => ({
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

  const orgUsers = orgUserRows.map((u) => ({ id: u.id, name: u.fullName }));

  // Comentarios + actividad para el panel lateral (Slice 1 ClickUp Parity).
  const [commentRows, activityRows] = await Promise.all([
    listComments(db, taskId),
    listActivity(db, taskId),
  ]);
  const comments = commentRows.map((c) => ({
    id: c.id,
    parentId: c.parent_comment_id,
    authorId: c.author_user_id,
    authorName: c.author?.full_name ?? "—",
    body: c.body,
    createdAt: c.created_at,
    editedAt: c.edited_at,
  }));
  const activity = activityRows.map((a) => ({
    id: a.id,
    eventType: a.event_type,
    actorName: a.actor?.full_name ?? null,
    payload: (a.payload ?? {}) as Record<string, unknown>,
    createdAt: a.created_at,
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
      />
    </div>
  );
}
