import { redirect } from "next/navigation";
import { getProject, listProjects, type ProjectRow } from "@agency-os/db";
import { matchesShortId, extractShortId, projectProgress } from "@agency-os/domain";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { projectHref } from "@/lib/project-paths";
import {
  ProjectsList,
  type ClientOption,
  type ProjectListRow,
} from "@/components/proyectos/projects-list";
import { ClientLogoUploader } from "@/components/proyectos/client-logo";
import { NoAccessPanel } from "@/components/no-access-panel";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SearchParams {
  q?: string;
}

function progressOf(row: ProjectRow): number {
  return projectProgress(
    Array.from({ length: row.tasks_count }, (_, i) => ({ statusIsDone: i < row.tasks_done_count })),
  );
}

// Space de un cliente: sus proyectos. También mantiene la compatibilidad con las
// URLs viejas de proyecto (/proyectos/<uuid>), redirigiéndolas al esquema nuevo.
export default async function ClienteSpacePage({
  params,
  searchParams,
}: {
  params: { cliente: string };
  searchParams: SearchParams;
}) {
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
  if (!organizationId) redirect("/proyectos");
  const db = await getSupabaseServerClient();

  // Compat: /proyectos/<uuid-de-proyecto> → ruta canónica del proyecto.
  if (UUID_RE.test(params.cliente)) {
    const project = await getProject(db, params.cliente);
    if (project && project.organization_id === organizationId) {
      redirect(projectHref(project.client, project));
    }
  }

  // Resolver el cliente por el código corto del segmento.
  const { data: clientRows } = await db
    .from("clients")
    .select("id, name, company, logo_path")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  const client = (clientRows ?? []).find((c) => matchesShortId(c.id, extractShortId(params.cliente)));
  if (!client) redirect("/proyectos");

  const logoUrl = client.logo_path
    ? (db.storage.from("client-logos").getPublicUrl(client.logo_path).data.publicUrl ?? null)
    : null;

  const projects = await listProjects(db, organizationId, {
    search: searchParams.q,
    clientId: client.id,
  });

  const rows: ProjectListRow[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    clientId: p.client?.id ?? client.id,
    clientName: p.client?.name ?? client.name,
    clientCompany: p.client?.company ?? client.company,
    tasksCount: p.tasks_count,
    progress: progressOf(p),
    projectState: p.project_state ?? "active",
  }));

  const lockedClient: ClientOption = {
    id: client.id,
    name: client.name,
    company: client.company,
  };

  return (
    <div className="space-y-6">
      <ClientLogoUploader
        clientId={client.id}
        name={client.name}
        company={client.company}
        initialLogoUrl={logoUrl}
        canManage={hasPermission(user, "project.manage")}
      />
      <ProjectsList
        rows={rows}
        q={searchParams.q ?? ""}
        clients={[lockedClient]}
        lockedClient={lockedClient}
        hideHeading
      />
    </div>
  );
}
