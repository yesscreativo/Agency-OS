import { describe, expect, it } from "vitest";
import { summarizeQuoteKpis, QUOTE_KPI_KEYS, type QuoteKpiSource } from "./quote-stats";

function row(status: string, overrides: Partial<QuoteKpiSource> = {}): QuoteKpiSource {
  return {
    status,
    currency: "COP",
    hasIva: false,
    ivaPercentage: 0,
    items: [{ clientPrice: 100, costPrice: 60, quantity: 2, isGroup: false }],
    ...overrides,
  };
}

describe("summarizeQuoteKpis", () => {
  it("returns every bucket zeroed for an empty list", () => {
    const kpis = summarizeQuoteKpis([]);
    for (const key of QUOTE_KPI_KEYS) {
      expect(kpis[key]).toEqual({ count: 0, amounts: {} });
    }
  });

  it("counts every row in total and status rows in their bucket", () => {
    const kpis = summarizeQuoteKpis([
      row("sent"),
      row("sent"),
      row("accepted"),
      row("under_review"),
      row("rejected"),
      row("closed"),
    ]);
    expect(kpis.total.count).toBe(6);
    expect(kpis.sent).toEqual({ count: 2, amounts: { COP: 400 } });
    expect(kpis.accepted).toEqual({ count: 1, amounts: { COP: 200 } });
    expect(kpis.under_review.count).toBe(1);
    expect(kpis.rejected.count).toBe(1);
    expect(kpis.closed.count).toBe(1);
  });

  it("counts non-bucket statuses only in total", () => {
    const kpis = summarizeQuoteKpis([
      row("draft"),
      row("modified"),
      row("purchased"),
      row("review_future"),
    ]);
    expect(kpis.total).toEqual({ count: 4, amounts: { COP: 800 } });
    for (const key of QUOTE_KPI_KEYS.filter((k) => k !== "total")) {
      expect(kpis[key]).toEqual({ count: 0, amounts: {} });
    }
  });

  it("keeps COP and USD amounts separate within a bucket", () => {
    const kpis = summarizeQuoteKpis([
      row("accepted"),
      row("accepted", { currency: "USD" }),
      row("purchased", { currency: "USD" }),
    ]);
    expect(kpis.accepted.amounts).toEqual({ COP: 200, USD: 200 });
    expect(kpis.total.amounts).toEqual({ COP: 200, USD: 400 });
    expect(kpis.total.count).toBe(3);
  });

  it("sums the client total with IVA applied", () => {
    const kpis = summarizeQuoteKpis([row("sent", { hasIva: true, ivaPercentage: 19 })]);
    expect(kpis.sent.amounts.COP).toBeCloseTo(238, 5); // 200 + 19%
    expect(kpis.total.amounts.COP).toBeCloseTo(238, 5);
  });

  it("excludes group rows from the sums, like the list column", () => {
    const kpis = summarizeQuoteKpis([
      row("sent", {
        items: [
          { clientPrice: 100, costPrice: 60, quantity: 1, isGroup: false },
          { clientPrice: 999, costPrice: 999, quantity: 1, isGroup: true },
        ],
      }),
    ]);
    expect(kpis.sent.amounts.COP).toBe(100);
  });
});
