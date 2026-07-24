import { describe, expect, it } from "vitest";
import { escapeHtml, formatDate, formatMoney } from "./format";

// Los montos formateados incluyen un espacio irrompible (NBSP,  ) entre el
// símbolo y el número — se compara contra el propio `Intl.NumberFormat` en vez de
// hardcodear el string exacto, para no depender de la versión de ICU del runtime.
function expectedMoney(amount: number, currency: string, decimals: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

describe("formatMoney", () => {
  it("formats COP with 0 decimals", () => {
    expect(formatMoney(1500000, "COP")).toBe(expectedMoney(1500000, "COP", 0));
  });

  it("formats USD with 2 decimals, es-CO separators", () => {
    expect(formatMoney(1500.5, "USD")).toBe(expectedMoney(1500.5, "USD", 2));
  });

  it("defaults to COP when currency is omitted", () => {
    expect(formatMoney(1000)).toBe(expectedMoney(1000, "COP", 0));
  });

  it("returns '--' for null/undefined", () => {
    expect(formatMoney(null)).toBe("--");
    expect(formatMoney(undefined)).toBe("--");
  });

  it("formats zero as a real amount, not as missing", () => {
    expect(formatMoney(0, "COP")).toBe(expectedMoney(0, "COP", 0));
  });
});

describe("formatDate", () => {
  it("formats a date in es-CO short form", () => {
    expect(formatDate("2026-03-06T12:00:00Z")).toBe("06 de mar de 2026");
  });

  it("returns '--' for falsy input", () => {
    expect(formatDate(null)).toBe("--");
    expect(formatDate(undefined)).toBe("--");
  });
});

describe("escapeHtml", () => {
  it("escapes &, \", < and >", () => {
    expect(escapeHtml(`<b>"Tom & Jerry"</b>`)).toBe(
      "&lt;b&gt;&quot;Tom &amp; Jerry&quot;&lt;/b&gt;",
    );
  });

  it("returns an empty string for falsy input", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml("")).toBe("");
  });
});
