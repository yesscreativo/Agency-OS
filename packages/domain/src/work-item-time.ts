/** Suma total de minutos de un conjunto de entradas de tiempo. */
export function sumMinutes(entries: { minutes: number }[]): number {
  return entries.reduce((total, e) => total + e.minutes, 0);
}

/** Agrupa minutos por usuario y ordena de mayor a menor. */
export function groupMinutesByUser<T extends { userId: string; minutes: number }>(
  entries: T[],
): { userId: string; minutes: number }[] {
  const byUser = new Map<string, number>();
  for (const e of entries) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + e.minutes);
  return [...byUser.entries()]
    .map(([userId, minutes]) => ({ userId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export interface ClientTimeProjectGroup {
  projectId: string;
  projectTitle: string;
  minutes: number;
}

export interface ClientTimeGroup {
  clientId: string;
  clientName: string;
  minutes: number;
  projects: ClientTimeProjectGroup[];
}

/** Agrupa minutos por cliente y, dentro de cada cliente, por proyecto. Ambos
 * niveles ordenados de mayor a menor minutos. */
export function groupTimeByClient<
  T extends {
    clientId: string;
    clientName: string;
    projectId: string;
    projectTitle: string;
    minutes: number;
  },
>(entries: T[]): ClientTimeGroup[] {
  const clients = new Map<
    string,
    { clientName: string; minutes: number; projects: Map<string, { projectTitle: string; minutes: number }> }
  >();
  for (const e of entries) {
    let c = clients.get(e.clientId);
    if (!c) {
      c = { clientName: e.clientName, minutes: 0, projects: new Map() };
      clients.set(e.clientId, c);
    }
    c.minutes += e.minutes;
    let p = c.projects.get(e.projectId);
    if (!p) {
      p = { projectTitle: e.projectTitle, minutes: 0 };
      c.projects.set(e.projectId, p);
    }
    p.minutes += e.minutes;
  }
  return [...clients.entries()]
    .map(([clientId, c]) => ({
      clientId,
      clientName: c.clientName,
      minutes: c.minutes,
      projects: [...c.projects.entries()]
        .map(([projectId, p]) => ({ projectId, projectTitle: p.projectTitle, minutes: p.minutes }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}
