import { WORK_ITEM_PRIORITIES, type WorkItemPriority } from "./work-item";

export interface RankableTask {
  priority: WorkItemPriority;
  estimatedMinutes: number | null;
}

/** Orden de la agenda semanal: 1) prioridad (urgente primero), 2) duración
 * estimada ascendente (las cortas primero, para generar impulso); sin
 * estimado va al final de su grupo de prioridad. Determinista, sin IA.
 * Devuelve una copia — no muta `tasks`. */
export function rankAgendaTasks<T extends RankableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const priorityDiff =
      WORK_ITEM_PRIORITIES.indexOf(b.priority) - WORK_ITEM_PRIORITIES.indexOf(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    if (a.estimatedMinutes === null && b.estimatedMinutes === null) return 0;
    if (a.estimatedMinutes === null) return 1;
    if (b.estimatedMinutes === null) return -1;
    return a.estimatedMinutes - b.estimatedMinutes;
  });
}
