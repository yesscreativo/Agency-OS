export interface ChecklistProgress {
  completed: number;
  total: number;
}

/** Progreso de una checklist: completados vs. total. Los ítems ya deben venir
 * filtrados sin los borrados (deleted_at) — esta función no filtra nada. */
export function checklistProgress(items: { isCompleted: boolean }[]): ChecklistProgress {
  return {
    completed: items.filter((i) => i.isCompleted).length,
    total: items.length,
  };
}
