import { describe, expect, it } from "vitest";
import { clientPriceFromMargin, marginPctFromPrices } from "./quote-item-margin";

describe("clientPriceFromMargin", () => {
  it("aplica el markup sobre el costo (no sobre la venta)", () => {
    expect(clientPriceFromMargin(100, 20)).toBe(120);
    expect(clientPriceFromMargin(1000, 30)).toBe(1300);
  });

  it("redondea al entero más cercano (paridad Math.round del legacy)", () => {
    expect(clientPriceFromMargin(333, 10)).toBe(366); // 366.3 -> 366
    expect(clientPriceFromMargin(333, 15)).toBe(383); // 382.95 -> 383
  });

  it("con markup 0 el precio cliente iguala al costo", () => {
    expect(clientPriceFromMargin(500, 0)).toBe(500);
  });

  it("tolera entradas no finitas devolviendo 0", () => {
    expect(clientPriceFromMargin(Number.NaN, 20)).toBe(0);
    expect(clientPriceFromMargin(100, Number.NaN)).toBe(0);
  });
});

describe("marginPctFromPrices", () => {
  it("calcula el % de markup sobre el costo", () => {
    expect(marginPctFromPrices(100, 120)).toBeCloseTo(20);
    expect(marginPctFromPrices(1000, 1300)).toBeCloseTo(30);
  });

  it("es la inversa de clientPriceFromMargin", () => {
    const cost = 250;
    const pct = 18;
    expect(marginPctFromPrices(cost, clientPriceFromMargin(cost, pct))).toBeCloseTo(pct, 1);
  });

  it("devuelve 0 si el costo es 0 o negativo (no hay markup calculable)", () => {
    expect(marginPctFromPrices(0, 500)).toBe(0);
    expect(marginPctFromPrices(-10, 500)).toBe(0);
  });

  it("puede ser negativo si el precio cliente es menor que el costo", () => {
    expect(marginPctFromPrices(100, 80)).toBeCloseTo(-20);
  });
});
