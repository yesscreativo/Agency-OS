export const WORK_ITEM_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export interface WorkItemProgressRow {
  statusIsDone: boolean;
}

/** % (0–100) de tareas cuyo estado es "done". 0 si no hay tareas. */
export function projectProgress(tasks: WorkItemProgressRow[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.statusIsDone).length;
  return Math.round((done / tasks.length) * 100);
}

export function validateWorkItemTitle(title: string): { valid: boolean; error?: string } {
  if (!title.trim()) return { valid: false, error: "El título es obligatorio." };
  return { valid: true };
}
