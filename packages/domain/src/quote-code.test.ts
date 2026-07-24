import { describe, expect, it } from "vitest";
import { buildQuoteCode, extractClientCode } from "./quote-code";

describe("extractClientCode", () => {
  it("takes the first 3 letters, uppercased, stripping non-letters", () => {
    expect(extractClientCode("Yesid Parra")).toBe("YES");
    expect(extractClientCode("3M Colombia")).toBe("MCO");
  });

  it("pads with X when shorter than 3 letters", () => {
    expect(extractClientCode("Yu")).toBe("YUX");
    expect(extractClientCode("")).toBe("XXX");
  });

  it("falls back to XXX when there is nothing usable", () => {
    expect(extractClientCode(null)).toBe("XXX");
    expect(extractClientCode("123")).toBe("XXX");
  });
});

describe("buildQuoteCode", () => {
  it("matches the MES+CLIENTE+DDMMAAAA-NN format", () => {
    const code = buildQuoteCode({
      clientName: "Yesid Parra",
      date: new Date("2026-03-06T12:00:00Z"),
      seq: 1,
    });
    expect(code).toBe("MARYES06032026-01");
  });

  it("prefers company over name when both are given", () => {
    const code = buildQuoteCode({
      clientName: "Yesid Parra",
      clientCompany: "3M Colombia",
      date: new Date("2026-01-15T12:00:00Z"),
      seq: 5,
    });
    expect(code).toBe("ENEMCO15012026-05");
  });

  it("pads the sequence to 2 digits", () => {
    const code = buildQuoteCode({
      clientName: "Yesid Parra",
      date: new Date("2026-12-31T12:00:00Z"),
      seq: 12,
    });
    expect(code).toBe("DICYES31122026-12");
  });
});
