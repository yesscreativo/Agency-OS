import { buildSlug, slugify } from "@agency-os/domain";

// Construcción de URLs del módulo Proyectos con el esquema Spaces:
//   /proyectos/[cliente]/[proyecto]/tareas/[tarea]
// Cada segmento lleva un slug legible + código corto (buildSlug) por el que se
// resuelve en el servidor. El de cliente es el mismo en el space del cliente y en
// las rutas de sus proyectos, para que el resaltado del sidebar case en ambos.
// Ver packages/domain/slug.ts.

export interface PathClient {
  id: string;
  name: string;
}

/** Segmento de cliente (slug+código). Si no hay cliente, cae a "cliente". */
function clientSegment(client: PathClient | null | undefined): string {
  if (!client) return "cliente";
  return buildSlug(client.name, client.id) || slugify(client.name) || "cliente";
}

/** Ruta del space de un cliente: /proyectos/{cliente}. */
export function clientHref(client: PathClient | null | undefined): string {
  return `/proyectos/${clientSegment(client)}`;
}

/** Ruta de un proyecto: /proyectos/{cliente}/{proyecto}. */
export function projectHref(
  client: PathClient | null | undefined,
  project: { id: string; title: string },
): string {
  return `${clientHref(client)}/${buildSlug(project.title, project.id)}`;
}

/** Ruta de una tarea a partir de la ruta base del proyecto. */
export function taskHref(projectBase: string, task: { id: string; title: string }): string {
  return `${projectBase}/tareas/${buildSlug(task.title, task.id)}`;
}
