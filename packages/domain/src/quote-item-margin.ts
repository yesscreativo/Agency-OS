// Extraído de onItemPriceChange() en js/index.js del cotizador viejo.
// Ojo: el "% margen" del cotizador es un MARKUP SOBRE COSTO (ganancia sobre el
// costo), no un margen sobre el precio de venta. Es decir, con costo 100 y 20%
// el precio cliente es 120, no 125.

/** Precio cliente a partir del costo y el % de markup sobre costo. Redondeado
 * (paridad con `Math.round` del legacy). */
export function clientPriceFromMargin(cost: number, marginPct: number): number {
  if (!Number.isFinite(cost) || !Number.isFinite(marginPct)) return 0;
  return Math.round(cost * (1 + marginPct / 100));
}

/** % de markup sobre costo a partir de costo y precio cliente. 0 si el costo es 0
 * (no se puede calcular markup sobre 0), igual que el legacy. */
export function marginPctFromPrices(cost: number, clientPrice: number): number {
  if (!Number.isFinite(cost) || !Number.isFinite(clientPrice) || cost <= 0) return 0;
  return ((clientPrice - cost) / cost) * 100;
}
