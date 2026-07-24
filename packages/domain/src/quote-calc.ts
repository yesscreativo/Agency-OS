// Extraído de recalc()/updateIVADisplay() en js/index.js del cotizador viejo.

export interface QuoteCalcItem {
  clientPrice: number;
  costPrice: number;
  quantity: number;
  isGroup: boolean;
}

export interface QuoteCalcOptions {
  /** El rol "creator" ve/paga el costo, no el precio de cliente (paridad con isCreator() del código viejo). */
  role: string;
  hasIva?: boolean;
  ivaPercentage?: number;
}

export interface QuoteCalcResult {
  subtotalClient: number;
  subtotalCost: number;
  margin: number;
  marginPercentage: number;
  ivaAmount: number;
  total: number;
  itemCount: number;
}

function priceToUse(item: QuoteCalcItem, role: string): number {
  if (role === "creator") return item.costPrice;
  return item.clientPrice > 0 ? item.clientPrice : item.costPrice;
}

export function calcQuote(
  items: QuoteCalcItem[],
  { role, hasIva = false, ivaPercentage = 0 }: QuoteCalcOptions,
): QuoteCalcResult {
  let subtotalClient = 0;
  let subtotalCost = 0;
  let itemCount = 0;

  for (const item of items) {
    if (item.isGroup) continue;
    subtotalClient += priceToUse(item, role) * item.quantity;
    subtotalCost += item.costPrice * item.quantity;
    itemCount++;
  }

  const margin = subtotalClient - subtotalCost;
  const marginPercentage = subtotalClient > 0 ? (margin / subtotalClient) * 100 : 0;
  const ivaAmount = hasIva ? (subtotalClient * ivaPercentage) / 100 : 0;
  const total = subtotalClient + ivaAmount;

  return { subtotalClient, subtotalCost, margin, marginPercentage, ivaAmount, total, itemCount };
}
