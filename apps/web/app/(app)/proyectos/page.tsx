import { redirect } from "next/navigation";
import { addDays, currentWeekRange, projectProgress, rankAgendaTasks } from "@agency-os/domain";
import { listClients, listMyAgenda, listProjects, type AgendaTask, type ProjectRow } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { projectHref, taskHref } from "@/lib/project-paths";
import { ProjectsList, type ClientOption, type ProjectListRow } from "@/components/proyectos/projects-list";
import { ProjectsDashboard, type AgendaDay, type AgendaTaskView } from "@/components/proyectos/projects-dashboard";
import { NoAccessPanel } from "@/components/no-access-panel";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
}

/** % de tareas del proyecto en un estado "hecho". `listProjects` ya trae los
 * conteos (`tasks_count`/`tasks_done_count`, ver work-items.ts) en vez de la
 * lista de tareas; se reconstruye un array sintético de booleans porque
 * `projectProgress` (dominio) solo necesita cuántas están done, no cuáles. */
function progressOf(row: ProjectRow): number {
  return projectProgress(
    Array.from({ length: row.tasks_count }, (_, i) => ({ statusIsDone: i < row.tasks_done_count })),
  );
}

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function greetingWord(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function toAgendaTaskView(t: AgendaTask): AgendaTaskView {
  const client = t.clientId ? { id: t.clientId, name: t.clientName ?? "" } : null;
  const projectBase = projectHref(client, { id: t.projectId, title: t.projectTitle });
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    statusId: t.statusId,
    startDate: t.startDate,
    priority: t.priority,
    dueDate: t.dueDate,
    estimatedMinutes: t.estimatedMinutes,
    projectTitle: t.projectTitle,
    clientName: t.clientName,
    href: taskHref(projectBase, { id: t.id, title: t.title }),
  };
}

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
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

  const now = new Date();
  const { from: weekStart } = currentWeekRange(now);
  const weekEnd = addDays(weekStart, 4);
  const dayOfWeek = now.getDay();
  const offsetFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const todayStr = addDays(weekStart, offsetFromMonday);
  const tomorrowStr = addDays(todayStr, 1);

  const agenda = organizationId
    ? await listMyAgenda(db, {
        organizationId,
        userId: user.id,
        today: todayStr,
        tomorrow: tomorrowStr,
        weekStart,
        weekEnd,
      })
    : await Promise.resolve<{
        todayCount: number;
        tomorrowCount: number;
        overdue: AgendaTask[];
        byDate: Record<string, AgendaTask[]>;
        undated: AgendaTask[];
      }>({ todayCount: 0, tomorrowCount: 0, overdue: [], byDate: {}, undated: [] });

  const days: AgendaDay[] = DAY_LABELS.map((label, i) => {
    const date = addDays(weekStart, i);
    return { date, label, tasks: rankAgendaTasks((agenda.byDate[date] ?? []).map(toAgendaTaskView)) };
  });
  const overdueTasks = rankAgendaTasks(agenda.overdue.map(toAgendaTaskView));
  const undatedTasks = agenda.undated.map(toAgendaTaskView);

  const [projects, clientsPage] = await Promise.all([
    organizationId
      ? listProjects(db, organizationId, { search: searchParams.q })
      : Promise.resolve<ProjectRow[]>([]),
    listClients(db, { pageSize: 200 }),
  ]);

  const rows: ProjectListRow[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    clientId: p.client?.id ?? null,
    clientName: p.client?.name ?? "—",
    clientCompany: p.client?.company ?? null,
    tasksCount: p.tasks_count,
    progress: progressOf(p),
    projectState: p.project_state ?? "active",
  }));

  const clients: ClientOption[] = clientsPage.rows.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
  }));

  return (
    <>
      <ProjectsDashboard
        greeting={greetingWord(now.getHours())}
        userName={user.fullName.split(" ")[0] ?? user.fullName}
        today={todayStr}
        todayCount={agenda.todayCount}
        tomorrowCount={agenda.tomorrowCount}
        days={days}
        overdueTasks={overdueTasks}
        undatedTasks={undatedTasks}
        canEdit={hasPermission(user, "project.manage")}
      />
      <ProjectsList
        rows={rows}
        q={searchParams.q ?? ""}
        clients={clients}
        canManage={hasPermission(user, "project.manage")}
      />
    </>
  );
}
