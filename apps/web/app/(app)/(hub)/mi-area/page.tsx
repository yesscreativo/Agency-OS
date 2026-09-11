import { redirect } from "next/navigation";
import Link from "next/link";
import {
  countOpenTasksByAssignee,
  listAreas,
  listAreasManagedBy,
  listJobTitles,
  listPeopleInArea,
  sumMinutesByUsersInRange,
} from "@agency-os/db";
import { currentWeekRange, isWeekday } from "@agency-os/domain";
import { Button, Input, Label } from "@agency-os/ui";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { JobTitlesManager } from "@/components/mi-area/job-titles-manager";
import { AreaCollaborators } from "@/components/mi-area/area-collaborators";
import { TeamWorkloadCards } from "@/components/mi-area/team-workload-cards";
import { OverloadThresholdEditor } from "@/components/mi-area/overload-threshold-editor";
import { MinDailyHoursEditor } from "@/components/mi-area/min-daily-hours-editor";

export const dynamic = "force-dynamic";

export default async function MiAreaPage({
  searchParams,
}: {
  searchParams: { area?: string; from?: string; to?: string };
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
  const defaultRange = currentWeekRange();
  const from = searchParams.from || defaultRange.from;
  const to = searchParams.to || defaultRange.to;
  const hasCustomRange = Boolean(searchParams.from || searchParams.to);
  const today = new Date().toISOString().slice(0, 10);
  const todayIsWeekday = isWeekday();
  const [openTasksByUser, minutesByUser, minutesTodayByUser] = await Promise.all([
    countOpenTasksByAssignee(db, { organizationId, userIds }),
    sumMinutesByUsersInRange(db, { organizationId, userIds, from, to }),
    todayIsWeekday
      ? sumMinutesByUsersInRange(db, { organizationId, userIds, from: today, to: today })
      : Promise.resolve({} as Record<string, number>),
  ]);

  // Colaboradores que hoy (día laborable) no llegan al mínimo del área —
  // igual criterio que `notify_missing_hours`, sin incluir al propio gerente.
  const missingToday = todayIsWeekday
    ? people.filter(
        (p) =>
          p.userId &&
          p.userId !== user.id &&
          (minutesTodayByUser[p.userId] ?? 0) < selected.min_daily_minutes,
      )
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Mi área</h1>
        {manageable.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {manageable.map((a) => (
              <Link
                key={a.id}
                href={`/mi-area?area=${a.id}`}
                className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                  a.id === selected.id
                    ? "border-green bg-green text-green-ink"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {a.name}
              </Link>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight">Carga del equipo</h2>
          <div className="flex flex-wrap items-center gap-4">
            <OverloadThresholdEditor areaId={selected.id} threshold={selected.overload_threshold} />
            <MinDailyHoursEditor areaId={selected.id} minutes={selected.min_daily_minutes} />
          </div>
        </div>

        {missingToday.length > 0 && (
          <div className="mt-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
            {missingToday.length} colaborador{missingToday.length === 1 ? "" : "es"} no{" "}
            {missingToday.length === 1 ? "ha registrado" : "han registrado"} suficiente tiempo hoy:{" "}
            {missingToday.map((p) => p.fullName).join(", ")}.
          </div>
        )}

        <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
          {searchParams.area && <input type="hidden" name="area" value={searchParams.area} />}
          <div>
            <Label htmlFor="ma-from">Desde</Label>
            <Input id="ma-from" type="date" name="from" defaultValue={from} className="w-40" />
          </div>
          <div>
            <Label htmlFor="ma-to">Hasta</Label>
            <Input id="ma-to" type="date" name="to" defaultValue={to} className="w-40" />
          </div>
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          {hasCustomRange && (
            <Link
              href={searchParams.area ? `/mi-area?area=${searchParams.area}` : "/mi-area"}
              className="text-sm text-muted transition hover:text-ink"
            >
              Volver a esta semana
            </Link>
          )}
        </form>

        <TeamWorkloadCards
          threshold={selected.overload_threshold}
          people={people.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            avatarUrl: p.avatarUrl,
            openTasks: p.userId ? (openTasksByUser[p.userId] ?? 0) : 0,
            minutesInRange: p.userId ? (minutesByUser[p.userId] ?? 0) : 0,
          }))}
        />
      </div>
    </div>
  );
}
