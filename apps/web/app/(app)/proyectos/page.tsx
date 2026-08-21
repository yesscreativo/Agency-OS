import { redirect } from "next/navigation";
import { projectProgress } from "@agency-os/domain";
import { listClients, listProjects, type ProjectRow } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectsList, type ClientOption, type ProjectListRow } from "@/components/proyectos/projects-list";
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

  return <ProjectsList rows={rows} q={searchParams.q ?? ""} clients={clients} />;
}
