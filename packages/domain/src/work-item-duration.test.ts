import { describe, it, expect } from "vitest";
import { formatDuration, parseDuration } from "./work-item-duration";

describe("formatDuration", () => {
  it("vacío para null/0/negativo", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-5)).toBe("");
  });
  it("solo minutos", () => expect(formatDuration(45)).toBe("45m"));
  it("horas exactas", () => expect(formatDuration(120)).toBe("2h"));
  it("horas y minutos", () => expect(formatDuration(90)).toBe("1h 30m"));
});

describe("parseDuration", () => {
  it("vacío => null sin error (limpia la estimación)", () => {
    expect(parseDuration("")).toEqual({ minutes: null });
    expect(parseDuration("   ")).toEqual({ minutes: null });
  });
  it("horas", () => expect(parseDuration("2h").minutes).toBe(120));
  it("minutos", () => expect(parseDuration("90m").minutes).toBe(90));
  it("horas y minutos con espacio", () => expect(parseDuration("1h 30m").minutes).toBe(90));
  it("horas y minutos pegados", () => expect(parseDuration("1h30m").minutes).toBe(90));
  it("horas decimales", () => expect(parseDuration("1.5h").minutes).toBe(90));
  it("número pelado se interpreta como horas", () => expect(parseDuration("3").minutes).toBe(180));
  it("acepta variantes en español", () => expect(parseDuration("2 horas 15 min").minutes).toBe(135));
  it("formato inválido => error y minutes null", () => {
    const r = parseDuration("abc");
    expect(r.minutes).toBeNull();
    expect(r.error).toBeTruthy();
  });
  it("ida y vuelta con formatDuration", () => {
    const mins = parseDuration("1h 30m").minutes!;
    expect(formatDuration(mins)).toBe("1h 30m");
  });
});
