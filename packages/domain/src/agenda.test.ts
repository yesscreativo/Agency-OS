import { describe, expect, it } from "vitest";
import { rankAgendaTasks } from "./agenda";

describe("rankAgendaTasks", () => {
  it("lista vacía", () => {
    expect(rankAgendaTasks([])).toEqual([]);
  });

  it("ordena por prioridad, urgente primero", () => {
    const tasks = [
      { id: "a", priority: "low" as const, estimatedMinutes: null },
      { id: "b", priority: "urgent" as const, estimatedMinutes: null },
      { id: "c", priority: "normal" as const, estimatedMinutes: null },
    ];
    expect(rankAgendaTasks(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("con la misma prioridad, ordena por duración estimada ascendente", () => {
    const tasks = [
      { id: "a", priority: "high" as const, estimatedMinutes: 120 },
      { id: "b", priority: "high" as const, estimatedMinutes: 30 },
      { id: "c", priority: "high" as const, estimatedMinutes: 60 },
    ];
    expect(rankAgendaTasks(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sin estimado va al final de su grupo de prioridad", () => {
    const tasks = [
      { id: "a", priority: "high" as const, estimatedMinutes: null },
      { id: "b", priority: "high" as const, estimatedMinutes: 30 },
    ];
    expect(rankAgendaTasks(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("no muta el array original", () => {
    const tasks = [
      { id: "a", priority: "low" as const, estimatedMinutes: null },
      { id: "b", priority: "urgent" as const, estimatedMinutes: null },
    ];
    const original = [...tasks];
    rankAgendaTasks(tasks);
    expect(tasks).toEqual(original);
  });
});
