// Etiqueta en español para el prefijo (antes del primer punto) de un
// `permissions.code` — ej. "quote.see_costs" → prefijo "quote" → "Cotizaciones".
// Si aparece un prefijo nuevo (permiso agregado por una migración futura sin
// actualizar este mapa), cae a mostrar el prefijo capitalizado — nunca rompe
// la UI del editor de roles por un permiso sin mapear.
const GROUP_LABELS: Record<string, string> = {
  quote: "Cotizaciones",
  quote_status: "Estados de cotización",
  project: "Proyectos",
  client: "Clientes",
  kam: "KAM / PM",
  people: "Personas",
  users: "Usuarios y roles",
  leave: "Vacaciones y permisos",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function groupLabel(code: string): string {
  const prefix = code.split(".")[0] ?? code;
  return GROUP_LABELS[prefix] ?? capitalize(prefix);
}

/** Agrupa permisos por `groupLabel(code)`, en orden alfabético de etiqueta.
 * Conserva el orden relativo de los permisos dentro de cada grupo. */
export function groupPermissions<T extends { code: string }>(
  permissions: T[],
): { label: string; items: T[] }[] {
  const byLabel = new Map<string, T[]>();
  for (const permission of permissions) {
    const label = groupLabel(permission.code);
    const list = byLabel.get(label);
    if (list) list.push(permission);
    else byLabel.set(label, [permission]);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }));
}
