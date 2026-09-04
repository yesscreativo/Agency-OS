import { redirect } from "next/navigation";
import {
  countOpenTasksByAssignee,
  listAreas,
  listAreasManagedBy,
  listJobTitles,
  listPeopleInArea,
  sumMinutesByUsersInRange,
} from "@agency-os/db";
import { currentWeekRange } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { JobTitlesManager } from "@/components/mi-area/job-titles-manager";
import { AreaCollaborators } from "@/components/mi-area/area-collaborators";
import { TeamWorkloadCards } from "@/components/mi-area/team-workload-cards";

export const dynamic = "force-dynamic";

export default async function MiAreaPage({
  searchParams,
}: {
  searchParams: { area?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const manageable = user.isSuper
    ? await listAreas(db, organizationId)
    : await listAreasManagedBy(db, user.id);

  if (manageable.length === 0) {
    return (
      <div className="mx-auto max-w-[560px]">
        <NoAccessPanel
          title="No administras ninguna área"
          message="Esta sección es para el gerente de un área (o el Administrador de sistema)."
        />
      </div>
    );
  }

  const selected = manageable.find((a) => a.id === searchParams.area) ?? manageable[0]!;

  const [jobTitles, people] = await Promise.all([
    listJobTitles(db, selected.id),
    listPeopleInArea(db, selected.id),
  ]);

  const userIds = people.map((p) => p.userId).filter((id): id is string => id !== null);
  const { from, to } = currentWeekRange();
  const [openTasksByUser, minutesByUser] = await Promise.all([
    countOpenTasksByAssignee(db, { organizationId, userIds }),
    sumMinutesByUsersInRange(db, { organizationId, userIds, from, to }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Mi área</h1>
        {manageable.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {manageable.map((a) => (
              <a
                key={a.id}
                href={`/mi-area?area=${a.id}`}
                className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                  a.id === selected.id
                    ? "border-green bg-green text-green-ink"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {a.name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <JobTitlesManager areaId={selected.id} jobTitles={jobTitles.map((jt) => ({ id: jt.id, name: jt.name }))} />
        <AreaCollaborators
          areaId={selected.id}
          people={people}
          jobTitles={jobTitles.map((jt) => ({ id: jt.id, name: jt.name }))}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-bold tracking-tight">Carga del equipo</h2>
        <TeamWorkloadCards
          people={people.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            openTasks: p.userId ? (openTasksByUser[p.userId] ?? 0) : 0,
            minutesThisWeek: p.userId ? (minutesByUser[p.userId] ?? 0) : 0,
          }))}
        />
      </div>
    </div>
  );
}
