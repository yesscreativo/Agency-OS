import { buildSlug, slugify } from "@agency-os/domain";

// Construcción de URLs del módulo Proyectos con el esquema Spaces:
//   /proyectos/[cliente]/[proyecto]/tareas/[tarea]
// El segmento de cliente es cosmético; proyecto y tarea llevan el código corto
// (buildSlug) por el que se resuelven en el servidor. Ver packages/domain/slug.ts.

/** Ruta de un proyecto: /proyectos/{cliente}/{proyecto-código}. */
export function projectHref(
  clientName: string | null | undefined,
  project: { id: string; title: string },
): string {
  const cliente = slugify(clientName ?? "") || "cliente";
  return `/proyectos/${cliente}/${buildSlug(project.title, project.id)}`;
}

/** Ruta de una tarea a partir de la ruta base del proyecto. */
export function taskHref(projectBase: string, task: { id: string; title: string }): string {
  return `${projectBase}/tareas/${buildSlug(task.title, task.id)}`;
}
