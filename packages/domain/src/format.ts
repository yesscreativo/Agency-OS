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

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
