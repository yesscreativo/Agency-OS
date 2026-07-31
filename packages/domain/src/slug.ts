// Slugs legibles para URLs de proyectos/tareas. El segmento es cosmético; la
// resolución real se hace por un "código corto" (primeros 8 hex del uuid) que se
// agrega al final del slug. Así la URL sobrevive renombres (el código no cambia)
// y no choca con títulos repetidos. Ej: "Rediseño Web" + uuid → "rediseno-web-9f4e8c2a".

/** Texto → slug ASCII en minúsculas separado por guiones (sin acentos ni símbolos). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos combinantes (á→a, ñ→n)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // por si el corte a 60 dejó un guión colgando
}

/** Código corto estable de un uuid: sus primeros 8 dígitos hex. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** slug legible + código corto: "rediseno-web-9f4e8c2a" (o solo el código si el
 * título no deja slug). */
export function buildSlug(title: string, id: string): string {
  const base = slugify(title);
  const code = shortId(id);
  return base ? `${base}-${code}` : code;
}

/** Extrae el código corto de un segmento de URL (siempre es el último token). */
export function extractShortId(segment: string): string {
  const token = segment.split("-").pop() ?? "";
  return token.toLowerCase();
}

/** ¿El uuid corresponde a este código corto? (comparación case-insensitive). */
export function matchesShortId(id: string, code: string): boolean {
  if (!code) return false;
  return shortId(id) === code.toLowerCase();
}
