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

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
