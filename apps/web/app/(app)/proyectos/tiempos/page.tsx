import { redirect } from "next/navigation";
import { getAreaMinDailyMinutesForPerson, reportEntries, sumMinutesByUsersInRange } from "@agency-os/db";
import { isWeekday } from "@agency-os/domain";
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
  const [entryRows, minDailyMinutes] = await Promise.all([
    reportEntries(db, {
      organizationId,
      userId: user.id,
      from: searchParams.from || undefined,
      to: searchParams.to || undefined,
    }),
    user.personId ? getAreaMinDailyMinutesForPerson(db, user.personId) : Promise.resolve(null),
  ]);

  // Alerta de "horas no registradas": solo si el usuario pertenece a un área
  // con umbral, hoy es día laborable, y aún no llega al mínimo.
  let missingHours: { minutesLogged: number; minDailyMinutes: number } | null = null;
  if (minDailyMinutes !== null && isWeekday()) {
    const today = new Date().toISOString().slice(0, 10);
    const minutesByUser = await sumMinutesByUsersInRange(db, {
      organizationId,
      userIds: [user.id],
      from: today,
      to: today,
    });
    const minutesLogged = minutesByUser[user.id] ?? 0;
    if (minutesLogged < minDailyMinutes) {
      missingHours = { minutesLogged, minDailyMinutes };
    }
  }

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
      missingHours={missingHours}
      filters={{
        from: searchParams.from ?? "",
        to: searchParams.to ?? "",
      }}
    />
  );
}
