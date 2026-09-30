import { notFound } from "next/navigation";
import {
  createSupabaseServiceRoleClient,
  getProject,
  getShareLinkByToken,
  listClientVisibleAttachmentsForProject,
  listClientVisibleCommentsForProject,
  listDependenciesForProject,
  listGanttTasks,
} from "@agency-os/db";
import { formatDate } from "@agency-os/domain";
import { ProjectGantt, type GanttDependency } from "@/components/proyectos/project-gantt";
import type { GanttTask } from "@/components/proyectos/gantt-task-modal";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-20 text-center sm:px-10">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-[#71717a]">{body}</p>
    </main>
  );
}

/** Vista pública de solo lectura del Gantt de un proyecto, por link con token
 * (sin login — Portal Cliente sigue sin construir, ver spec). Se resuelve
 * server-side con `service_role`, igual que `(public)/proveedor/[token]`. */
export default async function PublicProjectGanttPage({ params }: { params: { token: string } }) {
  const db = createSupabaseServiceRoleClient();
  const link = await getShareLinkByToken(db, params.token);
  if (!link) notFound();

  if (link.revoked_at) {
    return (
      <Notice
        title="Este enlace ya no está disponible"
        body="Contacta a tu equipo de Laburu Agency para que te compartan uno nuevo."
      />
    );
  }

  const project = await getProject(db, link.project_id);
  if (!project) notFound();

  const [ganttTaskRows, dependencyRows, comments, attachments] = await Promise.all([
    listGanttTasks(db, link.project_id),
    listDependenciesForProject(db, link.project_id),
    listClientVisibleCommentsForProject(db, link.project_id),
    listClientVisibleAttachmentsForProject(db, link.project_id),
  ]);

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

  const attachmentPaths = attachments.map((a) => a.path);
  const { data: signedUrls } = attachmentPaths.length
    ? await db.storage.from("work-item-files").createSignedUrls(attachmentPaths, 60 * 60)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signedUrls ?? []).map((u) => [u.path, u.signedUrl]));

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10 font-sans sm:px-10">
      <div className="mb-8">
        <div className="font-mono text-sm font-bold">{project.client?.name ?? ""}</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{project.title}</h1>
      </div>

      <ProjectGantt
        projectId={project.id}
        tasks={ganttTasks}
        dependencies={ganttDependencies}
        statuses={project.statuses.map((s) => ({ id: s.id, label: s.label, color: s.color, isDone: s.is_done }))}
        orgUsers={[]}
        canManage={false}
      />

      {(comments.length > 0 || attachments.length > 0) && (
        <div className="mt-8 rounded-lg border border-[#e4e4e7] bg-white p-5 sm:p-7">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#71717a]">Actualizaciones</h2>
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="border-b border-[#e4e4e7] pb-3 last:border-0">
                <div className="text-xs text-[#a1a1aa]">
                  {c.author?.full_name ?? "Equipo"} · {formatDate(c.created_at)}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-[#161618]">{c.body}</p>
              </div>
            ))}
            {attachments.map((a) => {
              const url = urlByPath.get(a.path);
              return url ? (
                <a
                  key={a.id}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-[#378add] underline"
                >
                  {a.filename}
                </a>
              ) : null;
            })}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-[#a1a1aa]">Laburu Agency</p>
    </main>
  );
}
