import { redirect } from "next/navigation";
import { reportEntries } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { TimeReport } from "@/components/proyectos/time-report";

export const dynamic = "force-dynamic";

export default async function ProyectosTiemposPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const entryRows = await reportEntries(db, {
    organizationId,
    userId: user.id,
    from: searchParams.from || undefined,
    to: searchParams.to || undefined,
  });

  const entries = entryRows.map((e) => ({
    id: e.id,
    userId: e.user_id,
    userName: e.user?.full_name ?? "—",
    userAvatarUrl: e.user?.avatar_url ?? null,
    taskTitle: e.taskTitle,
    projectId: e.projectId,
    projectTitle: e.projectTitle,
    clientId: e.clientId,
    clientName: e.clientName,
    minutes: e.minutes,
    spentOn: e.spent_on,
    note: e.note,
  }));

  return (
    <TimeReport
      entries={entries}
      filters={{
        from: searchParams.from ?? "",
        to: searchParams.to ?? "",
      }}
    />
  );
}
