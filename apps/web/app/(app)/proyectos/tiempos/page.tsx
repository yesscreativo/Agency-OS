import { redirect } from "next/navigation";
import { listProjects, reportEntries } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { TimeReport } from "@/components/proyectos/time-report";

export const dynamic = "force-dynamic";

export default async function ProyectosTiemposPage({
  searchParams,
}: {
  searchParams: { scope?: string; project?: string; from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const organizationId = user.organizationIds[0] ?? "";
  const canManage = hasPermission(user, "project.manage");
  const scope: "mine" | "team" = searchParams.scope === "team" && canManage ? "team" : "mine";

  const db = await getSupabaseServerClient();
  const [entryRows, projects] = await Promise.all([
    reportEntries(db, {
      organizationId,
      userId: scope === "mine" ? user.id : undefined,
      projectId: searchParams.project || undefined,
      from: searchParams.from || undefined,
      to: searchParams.to || undefined,
    }),
    listProjects(db, organizationId),
  ]);

  const entries = entryRows.map((e) => ({
    id: e.id,
    userId: e.user_id,
    userName: e.user?.full_name ?? "—",
    userAvatarUrl: e.user?.avatar_url ?? null,
    taskTitle: e.taskTitle,
    minutes: e.minutes,
    spentOn: e.spent_on,
    note: e.note,
  }));

  return (
    <TimeReport
      scope={scope}
      canManage={canManage}
      entries={entries}
      projects={projects.map((p) => ({ id: p.id, title: p.title }))}
      filters={{
        project: searchParams.project ?? "",
        from: searchParams.from ?? "",
        to: searchParams.to ?? "",
      }}
    />
  );
}
