// Lógica pura de fechas/dependencias del Gantt de proyectos. Cero I/O: recibe
// snapshots de tareas/dependencias y devuelve qué cambiaría, sin tocar la DB
// (eso lo hace la server action que la consume, ver gantt-actions.ts).

export interface GanttTaskDates {
  id: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
}

export interface DependencyEdge {
  workItemId: string; // tarea bloqueada
  dependsOnWorkItemId: string; // tarea bloqueante
}

export interface CascadeUpdate {
  id: string;
  startDate: string;
  dueDate: string;
}

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas ISO (`to` - `from`). */
export function dayOffset(fromIso: string, toIso: string): number {
  return Math.round((toUTCDate(toIso).getTime() - toUTCDate(fromIso).getTime()) / 86_400_000);
}

/** Ancho de la barra en días, inclusivo (mismo día = 1, nunca menor a 1). */
export function barWidthDays(startIso: string, dueIso: string): number {
  return Math.max(1, dayOffset(startIso, dueIso) + 1);
}

export function isSelfDependency(workItemId: string, dependsOnWorkItemId: string): boolean {
  return workItemId === dependsOnWorkItemId;
}

/** Solo detecta el ciclo DIRECTO (A↔B) — sin recorrido de grafo multi-salto,
 * a propósito (ver spec, sección "Fuera de alcance"). */
export function isDirectCycle(edges: DependencyEdge[], candidate: DependencyEdge): boolean {
  return edges.some(
    (e) =>
      e.workItemId === candidate.dependsOnWorkItemId && e.dependsOnWorkItemId === candidate.workItemId,
  );
}

/** Tras un cambio de fechas en `movedId`, empuja hacia ADELANTE (nunca acorta)
 * a sus dependientes directos y transitivos. Si una tarea tiene varios
 * bloqueantes, la restricción es el que tenga la fecha de fin más tardía.
 * Devuelve solo las tareas cuya fecha efectivamente cambió (sin incluir
 * `movedId`). No muta `tasks`. */
export function cascadeForwardShift(
  tasks: GanttTaskDates[],
  edges: DependencyEdge[],
  movedId: string,
): CascadeUpdate[] {
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));

  const dependentsOf = new Map<string, string[]>(); // blockerId -> [blockedId, ...]
  const blockersOf = new Map<string, string[]>(); // blockedId -> [blockerId, ...]
  for (const e of edges) {
    (dependentsOf.get(e.dependsOnWorkItemId) ?? dependentsOf.set(e.dependsOnWorkItemId, []).get(e.dependsOnWorkItemId)!).push(
      e.workItemId,
    );
    (blockersOf.get(e.workItemId) ?? blockersOf.set(e.workItemId, []).get(e.workItemId)!).push(
      e.dependsOnWorkItemId,
    );
  }

  const changed = new Map<string, CascadeUpdate>();
  const queue: string[] = [movedId];
  const queued = new Set<string>(queue);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    queued.delete(currentId);
    for (const blockedId of dependentsOf.get(currentId) ?? []) {
      const blocked = byId.get(blockedId);
      if (!blocked) continue;

      let latestBlockerDue = "";
      for (const blockerId of blockersOf.get(blockedId) ?? []) {
        const blocker = byId.get(blockerId);
        if (blocker && blocker.dueDate > latestBlockerDue) latestBlockerDue = blocker.dueDate;
      }
      if (!latestBlockerDue || blocked.startDate >= latestBlockerDue) continue; // solo empuja adelante

      const duration = dayOffset(blocked.startDate, blocked.dueDate);
      const newStart = latestBlockerDue;
      const newDue = addDays(newStart, duration);
      if (newStart === blocked.startDate && newDue === blocked.dueDate) continue;

      blocked.startDate = newStart;
      blocked.dueDate = newDue;
      byId.set(blockedId, blocked);
      changed.set(blockedId, { id: blockedId, startDate: newStart, dueDate: newDue });

      if (!queued.has(blockedId)) {
        queue.push(blockedId);
        queued.add(blockedId);
      }
    }
  }

  return Array.from(changed.values());
}
