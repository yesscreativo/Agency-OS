// Duración estimada de un work item. Se persiste en MINUTOS (columna
// `work_items.estimated_minutes`); la UI la ingresa/renderiza en horas y minutos
// (ej. "1h 30m"). No se manejan "días" a propósito: la duración de una jornada
// laboral no es universal (varía por agencia), así que se evita la ambigüedad.

export interface ParsedDuration {
  /** minutos (>=0) o null si el input está vacío o es inválido. */
  minutes: number | null;
  /** presente solo cuando el input no se pudo interpretar. */
  error?: string;
}

const INVALID = "Formato inválido. Usa p. ej. 2h, 90m o 1h 30m.";
// Cada token: número (admite decimales) + unidad de hora o minuto (es/en).
// Unidades de más larga a más corta: la alternancia regex toma la primera que
// matchea, así "min"/"horas" no se truncan a "m"/"h".
const TOKEN = /(\d+(?:\.\d+)?)\s*(horas|hora|hrs|hr|h|minutos|minuto|mins|min|m)/g;

/** Interpreta texto libre ("2h", "90m", "1h 30m", "1.5h", "3") a minutos.
 * Un número pelado se interpreta como horas. Vacío => null sin error (limpia la
 * estimación). Texto no interpretable => error + minutes null. */
export function parseDuration(input: string): ParsedDuration {
  const raw = input.trim().toLowerCase();
  if (raw === "") return { minutes: null };

  // Número pelado => horas.
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return { minutes: Math.round(parseFloat(raw) * 60) };
  }

  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(raw)) !== null) {
    matched = true;
    const value = parseFloat(match[1]!);
    const unit = match[2]!;
    total += unit.startsWith("h") ? value * 60 : value;
  }
  if (!matched) return { minutes: null, error: INVALID };

  // Todo el string debe ser tokens (ignorando espacios); si sobra algo, es inválido.
  const leftover = raw.replace(TOKEN, "").replace(/\s+/g, "");
  if (leftover !== "") return { minutes: null, error: INVALID };

  return { minutes: Math.round(total) };
}

/** Minutos => "1h 30m" / "2h" / "45m". null/0/negativo => "" (sin estimación). */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
