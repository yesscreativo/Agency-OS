import { describe, it, expect } from "vitest";
import { slugify, shortId, buildSlug, extractShortId, matchesShortId } from "./slug";

const UUID = "9f4e8c2a-1b2c-4d5e-6f70-abcdef123456";

describe("slugify", () => {
  it("minúsculas y guiones", () => expect(slugify("Cliente Alfa")).toBe("cliente-alfa"));
  it("quita acentos y ñ", () => expect(slugify("Rediseño Web")).toBe("rediseno-web"));
  it("colapsa símbolos y espacios", () => expect(slugify("  Hola,  Mundo!! ")).toBe("hola-mundo"));
  it("vacío si no queda nada", () => expect(slugify("¡!¿?")).toBe(""));
  it("trunca largo sin guión colgando", () => {
    const out = slugify("a".repeat(80));
    expect(out.length).toBeLessThanOrEqual(60);
  });
});

describe("shortId", () => {
  it("primeros 8 hex del uuid", () => expect(shortId(UUID)).toBe("9f4e8c2a"));
});

describe("buildSlug", () => {
  it("slug + código", () => expect(buildSlug("Rediseño Web", UUID)).toBe("rediseno-web-9f4e8c2a"));
  it("solo código si el título no deja slug", () => expect(buildSlug("¡!", UUID)).toBe("9f4e8c2a"));
});

describe("extractShortId", () => {
  it("toma el último token", () =>
    expect(extractShortId("rediseno-web-9f4e8c2a")).toBe("9f4e8c2a"));
  it("segmento que es solo el código", () =>
    expect(extractShortId("9f4e8c2a")).toBe("9f4e8c2a"));
});

describe("matchesShortId", () => {
  it("verdadero para el código correcto", () => expect(matchesShortId(UUID, "9f4e8c2a")).toBe(true));
  it("case-insensitive", () => expect(matchesShortId(UUID, "9F4E8C2A")).toBe(true));
  it("falso para otro código", () => expect(matchesShortId(UUID, "ffffffff")).toBe(false));
  it("falso para vacío", () => expect(matchesShortId(UUID, "")).toBe(false));
  it("ida y vuelta con buildSlug/extractShortId", () => {
    const seg = buildSlug("Rediseño Web", UUID);
    expect(matchesShortId(UUID, extractShortId(seg))).toBe(true);
  });
});
