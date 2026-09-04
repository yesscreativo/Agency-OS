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
