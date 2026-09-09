import type { Db } from "@agency-os/db";
import { projectHref, taskHref } from "@/lib/project-paths";

/** Ruta canónica del tablero de un proyecto (con slugs+código corto),
 * resolviendo cliente. Best-effort: null si el proyecto no existe. */
export async function resolveProjectLink(db: Db, projectId: string): Promise<string | null> {
  const { data: project } = await db
    .from("work_items")
    .select("id, title, client_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;
  let client: { id: string; name: string } | null = null;
  if (project.client_id) {
    const { data: c } = await db
      .from("clients")
      .select("id, name")
      .eq("id", project.client_id)
      .maybeSingle();
    if (c) client = { id: c.id, name: c.name };
  }
  return projectHref(client, { id: project.id, title: project.title });
}

/** Ruta canónica de una tarea (con slugs+código corto), resolviendo
 * proyecto → cliente. Best-effort: si algo falta devuelve null (los llamadores
 * caen a un path más amplio, ej. `/proyectos`). Compartida por comentarios,
 * adjuntos y time tracking para no repetir el mismo par de queries en cada
 * archivo. */
export async function resolveTaskLink(
  db: Db,
  projectId: string,
  task: { id: string; title: string },
): Promise<string | null> {
  const base = await resolveProjectLink(db, projectId);
  if (!base) return null;
  return taskHref(base, task);
}
