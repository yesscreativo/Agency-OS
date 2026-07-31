import { redirect } from "next/navigation";
import { getProject } from "@agency-os/db";
import { canAccessModule, getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { projectHref } from "@/lib/project-paths";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ruta de un cliente-Space. Por ahora (H1a) solo maneja la compatibilidad con las
// URLs viejas de proyecto (/proyectos/<uuid>) redirigiéndolas al esquema nuevo
// /proyectos/[cliente]/[proyecto]. El space del cliente (lista de sus proyectos)
// llega en H1b (sidebar). Cualquier otro segmento vuelve a la raíz.
export default async function ClienteSpacePage({ params }: { params: { cliente: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "proyectos")) redirect("/inicio");

  const organizationId = user.organizationIds[0];
  if (organizationId && UUID_RE.test(params.cliente)) {
    const db = await getSupabaseServerClient();
    const project = await getProject(db, params.cliente);
    if (project && project.organization_id === organizationId) {
      redirect(projectHref(project.client?.name, project));
    }
  }

  redirect("/proyectos");
}
