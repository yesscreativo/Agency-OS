// Extraído de js/shared.js (fmtMoney, fmtDate, esc) del cotizador viejo.

export function formatMoney(amount: number | null | undefined, currency: string = "COP"): string {
  if (amount === null || amount === undefined) return "--";
  const decimals = currency === "USD" ? 2 : 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha relativa corta en español ("hace 3 h"); cae a fecha absoluta pasada una
 * semana. `now` se inyecta para poder testear de forma determinista. */
export function formatRelative(
  date: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!date) return "--";
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return formatDate(date); // fechas futuras: mostrar la absoluta
  if (sec < 60) return "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `hace ${days} d`;
  return formatDate(date);
}

/** Iniciales para avatares: primera + última palabra del nombre. Antes estaba
 * duplicada como `initialsOf` en varios componentes; esta es la versión canónica. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first) return "?";
  if (parts.length === 1) return first.charAt(0).toUpperCase();
  return (first.charAt(0) + (last?.charAt(0) ?? "")).toUpperCase();
}

/** Parte una fecha en {y,m,d} sin sesgo de timezone. Las fechas de work_items
 * son columnas `date` ("2026-08-10"); `new Date(str)` las interpretaría como UTC
 * y podría correr un día en zonas negativas, así que las leemos por componentes. */
function dateParts(date: string | Date): { y: number; m: number; d: number } {
  if (typeof date === "string") {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  const dt = new Date(date);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** Fecha corta día/mes sin año ("10/8"), estilo ClickUp. `--` si vacía. */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return "--";
  const { m, d } = dateParts(date);
  return `${d}/${m}`;
}

/** Rango de fechas compacto: "10/8 → 12/8 (3d)" (conteo de días inclusivo). Si
 * solo hay una fecha, muestra esa; sin fechas, cadena vacía. */
export function dateRangeLabel(
  start: string | Date | null | undefined,
  due: string | Date | null | undefined,
): string {
  if (!start && !due) return "";
  if (start && !due) return formatDateShort(start);
  if (!start && due) return formatDateShort(due);
  const a = dateParts(start!);
  const b = dateParts(due!);
  const msPerDay = 24 * 60 * 60 * 1000;
  const days =
    Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / msPerDay) + 1;
  return `${formatDateShort(start!)} → ${formatDateShort(due!)} (${days}d)`;
}

/** Días de retraso: cuántos días hace que pasó `due` respecto a `today` (solo
 * fecha, sin hora). 0 si no hay fecha o aún no vence. */
export function daysOverdue(
  due: string | Date | null | undefined,
  today: Date = new Date(),
): number {
  if (!due) return 0;
  const d = dateParts(due);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.y, d.m - 1, d.d)) /
      msPerDay,
  );
  return diff > 0 ? diff : 0;
}

/** ¿La tarea está retrasada? Vence antes de hoy y NO está en un estado "hecho". */
export function isOverdue(
  due: string | Date | null | undefined,
  isDone: boolean,
  today: Date = new Date(),
): boolean {
  if (isDone) return false;
  return daysOverdue(due, today) > 0;
}

/** Etiqueta legible del retraso ("Retrasada 3 días"); "" si no está retrasada. */
export function overdueLabel(
  due: string | Date | null | undefined,
  today: Date = new Date(),
): string {
  const n = daysOverdue(due, today);
  if (n <= 0) return "";
  return n === 1 ? "Retrasada 1 día" : `Retrasada ${n} días`;
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
