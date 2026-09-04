// Panel "Mis tiempos" / "Tiempos del equipo" (ClickUp Parity Fase C). Server
// component puro: los filtros son un <form method="get"> (sin JS), el toggle de
// scope son enlaces con query param — no hace falta estado de cliente.

import { Avatar, Button, Input, Label, Select } from "@agency-os/ui";
import { formatDuration, groupMinutesByUser, initialsOf } from "@agency-os/domain";
import { ClientTimeMasterDetail } from "./client-time-master-detail";

export interface TimeReportEntry {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
  minutes: number;
  spentOn: string;
  note: string | null;
}

export interface TimeReportProject {
  id: string;
  title: string;
}

interface TimeReportProps {
  scope: "mine" | "team";
  canManage: boolean;
  entries: TimeReportEntry[];
  projects: TimeReportProject[];
  filters: { project: string; from: string; to: string };
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export function TimeReport({ scope, canManage, entries, projects, filters }: TimeReportProps) {
  const totalMinutes = entries.reduce((n, e) => n + e.minutes, 0);
  const byUser = groupMinutesByUser(entries.map((e) => ({ userId: e.userId, minutes: e.minutes })));
  const infoByUser = new Map(entries.map((e) => [e.userId, { name: e.userName, avatarUrl: e.userAvatarUrl }]));
  const hasFilters = Boolean(filters.project || filters.from || filters.to);
  const clearHref = scope === "team" ? "/proyectos/tiempos?scope=team" : "/proyectos/tiempos";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {scope === "team" ? "Tiempos del equipo" : "Mis tiempos"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {scope === "team"
              ? "Tiempo registrado en tareas de Proyectos."
              : "Tiempo que has registrado, por cliente."}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <a
              href="/proyectos/tiempos"
              className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                scope === "mine"
                  ? "border-green bg-green text-green-ink"
                  : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              Mis tiempos
            </a>
            <a
              href="/proyectos/tiempos?scope=team"
              className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                scope === "team"
                  ? "border-green bg-green text-green-ink"
                  : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              Tiempos del equipo
            </a>
          </div>
        )}
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        {scope === "team" && <input type="hidden" name="scope" value="team" />}
        {scope === "team" && (
          <div>
            <Label htmlFor="tr-project">Proyecto</Label>
            <Select id="tr-project" name="project" defaultValue={filters.project} className="w-56">
              <option value="">Todos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="tr-from">Desde</Label>
          <Input id="tr-from" type="date" name="from" defaultValue={filters.from} className="w-40" />
        </div>
        <div>
          <Label htmlFor="tr-to">Hasta</Label>
          <Input id="tr-to" type="date" name="to" defaultValue={filters.to} className="w-40" />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        {hasFilters && (
          <a href={clearHref} className="text-sm text-muted transition hover:text-ink">
            Limpiar filtros
          </a>
        )}
      </form>

      <div className="mt-6 rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="text-lg font-semibold tabular-nums text-ink">
            {totalMinutes > 0 ? formatDuration(totalMinutes) : "0m"}
          </span>
        </div>
        {scope === "team" && byUser.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {byUser.map((u) => {
              const info = infoByUser.get(u.userId);
              return (
                <div
                  key={u.userId}
                  className="flex items-center gap-2 rounded-pill border border-line bg-glass px-3 py-1.5 text-sm"
                >
                  <Avatar initials={initialsOf(info?.name ?? "—")} src={info?.avatarUrl ?? null} size="xs" />
                  <span className="text-muted">{info?.name ?? "—"}</span>
                  <span className="font-semibold tabular-nums text-ink">{formatDuration(u.minutes)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {scope === "mine" ? (
        <ClientTimeMasterDetail entries={entries} />
      ) : (
        <div className="mt-4 space-y-1.5">
          {entries.length === 0 ? (
            <p className="rounded-lg border border-line bg-glass px-8 py-16 text-center text-sm text-muted backdrop-blur-xl">
              No hay tiempo registrado en este rango.
            </p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-glass px-4 py-3 text-sm backdrop-blur-xl"
              >
                <Avatar initials={initialsOf(e.userName)} src={e.userAvatarUrl} size="xs" />
                <span className="w-24 shrink-0 text-muted">{formatDay(e.spentOn)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{e.taskTitle}</span>
                <span className="text-muted">{e.userName}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">{formatDuration(e.minutes)}</span>
                {e.note && (
                  <span className="w-full truncate pl-9 text-xs text-muted sm:w-auto sm:flex-1 sm:pl-0">
                    {e.note}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
