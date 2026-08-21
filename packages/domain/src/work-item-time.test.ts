import { describe, expect, it } from "vitest";
import { groupMinutesByUser, sumMinutes } from "./work-item-time";

describe("sumMinutes", () => {
  it("suma los minutos de las entradas", () => {
    expect(sumMinutes([{ minutes: 30 }, { minutes: 90 }])).toBe(120);
  });
  it("es 0 sin entradas", () => {
    expect(sumMinutes([])).toBe(0);
  });
});

describe("groupMinutesByUser", () => {
  it("agrupa y suma por usuario, orden desc", () => {
    const out = groupMinutesByUser([
      { userId: "a", minutes: 30 },
      { userId: "b", minutes: 120 },
      { userId: "a", minutes: 15 },
    ]);
    expect(out).toEqual([
      { userId: "b", minutes: 120 },
      { userId: "a", minutes: 45 },
    ]);
  });
});
