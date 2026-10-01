/** Escapa un valor para una celda CSV: neutraliza inyección de fórmulas
 * (Excel/Sheets ejecutan una celda que empieza con =, +, -, @ o tab/CR como
 * fórmula — un nombre u observación es texto libre que alguien podría setear
 * así a propósito) anteponiendo un apóstrofe, y entre comillas dobles si tiene
 * coma, comilla o salto de línea. */
export function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Arma el CSV completo (con BOM para que Excel abra UTF-8 con tildes bien). */
export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return "﻿" + lines.join("\r\n");
}
