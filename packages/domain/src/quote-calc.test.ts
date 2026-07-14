import { describe, expect, it } from "vitest";
import { calcQuote, type QuoteCalcItem } from "./quote-calc";

const items: QuoteCalcItem[] = [
  { clientPrice: 100, costPrice: 60, quantity: 2, isGroup: false },
  { clientPrice: 50, costPrice: 30, quantity: 1, isGroup: false },
];

describe("calcQuote", () => {
  it("sums client/cost totals and derives margin for a non-creator role", () => {
    const result = calcQuote(items, { role: "kam" });
    expect(result.subtotalClient).toBe(250); // 100*2 + 50*1
    expect(result.subtotalCost).toBe(150); // 60*2 + 30*1
    expect(result.margin).toBe(100);
    expect(result.marginPercentage).toBeCloseTo(40, 5); // 100/250*100
    expect(result.itemCount).toBe(2);
  });

  it("uses cost_price as the client total for the creator role", () => {
    const result = calcQuote(items, { role: "creator" });
    expect(result.subtotalClient).toBe(150); // cost_price*qty for every item
    expect(result.subtotalCost).toBe(150);
    expect(result.margin).toBe(0);
  });

  it("falls back to cost_price when client_price is not set (<=0)", () => {
    const withoutClientPrice: QuoteCalcItem[] = [
      { clientPrice: 0, costPrice: 40, quantity: 3, isGroup: false },
    ];
    const result = calcQuote(withoutClientPrice, { role: "kam" });
    expect(result.subtotalClient).toBe(120); // cost_price used as fallback
  });

  it("excludes group rows from every total", () => {
    const withGroup: QuoteCalcItem[] = [
      ...items,
      { clientPrice: 999, costPrice: 999, quantity: 1, isGroup: true },
    ];
    const result = calcQuote(withGroup, { role: "kam" });
    expect(result.subtotalClient).toBe(250);
    expect(result.itemCount).toBe(2);
  });

  it("returns 0% margin when the client subtotal is 0", () => {
    const result = calcQuote([], { role: "kam" });
    expect(result.subtotalClient).toBe(0);
    expect(result.marginPercentage).toBe(0);
  });

  it("computes IVA and grand total only when hasIva is true", () => {
    const withIva = calcQuote(items, { role: "kam", hasIva: true, ivaPercentage: 19 });
    expect(withIva.ivaAmount).toBeCloseTo(47.5, 5); // 250*0.19
    expect(withIva.total).toBeCloseTo(297.5, 5);

    const withoutIva = calcQuote(items, { role: "kam", hasIva: false, ivaPercentage: 19 });
    expect(withoutIva.ivaAmount).toBe(0);
    expect(withoutIva.total).toBe(250);
  });
});
