import { describe, expect, it } from "vitest";
import {
  barWidthDays,
  cascadeForwardShift,
  dayOffset,
  isDirectCycle,
  isSelfDependency,
  monthSegments,
} from "./gantt";

describe("isSelfDependency", () => {
  it("es true cuando una tarea depende de sí misma", () => {
    expect(isSelfDependency("a", "a")).toBe(true);
    expect(isSelfDependency("a", "b")).toBe(false);
  });
});

describe("isDirectCycle", () => {
  it("detecta el ciclo directo A depende de B, B ya dependía de A", () => {
    const edges = [{ workItemId: "b", dependsOnWorkItemId: "a" }];
    expect(isDirectCycle(edges, { workItemId: "a", dependsOnWorkItemId: "b" })).toBe(true);
  });

  it("no marca ciclo si la relación no es directa", () => {
    const edges = [{ workItemId: "b", dependsOnWorkItemId: "a" }];
    expect(isDirectCycle(edges, { workItemId: "c", dependsOnWorkItemId: "a" })).toBe(false);
  });
});

describe("dayOffset / barWidthDays", () => {
  it("cuenta días entre dos fechas ISO", () => {
    expect(dayOffset("2026-01-01", "2026-01-06")).toBe(5);
  });

  it("el ancho de barra es inclusivo (mismo día = 1)", () => {
    expect(barWidthDays("2026-01-06", "2026-01-06")).toBe(1);
    expect(barWidthDays("2026-01-06", "2026-01-20")).toBe(15);
  });
});

describe("cascadeForwardShift", () => {
  it("empuja hacia adelante a la tarea bloqueada cuando la bloqueante se atrasa", () => {
    const tasks = [
      { id: "design", startDate: "2026-01-06", dueDate: "2026-01-25" }, // se atrasó 5 días (era 01-20)
      { id: "dev", startDate: "2026-01-15", dueDate: "2026-02-05" },
    ];
    const edges = [{ workItemId: "dev", dependsOnWorkItemId: "design" }];
    const result = cascadeForwardShift(tasks, edges, "design");
    expect(result).toEqual([{ id: "dev", startDate: "2026-01-25", dueDate: "2026-02-15" }]);
  });

  it("no acorta la tarea bloqueada si la bloqueante se adelanta", () => {
    const tasks = [
      { id: "design", startDate: "2026-01-06", dueDate: "2026-01-10" }, // se adelantó (era 01-20)
      { id: "dev", startDate: "2026-01-15", dueDate: "2026-02-05" },
    ];
    const edges = [{ workItemId: "dev", dependsOnWorkItemId: "design" }];
    expect(cascadeForwardShift(tasks, edges, "design")).toEqual([]);
  });

  it("se propaga transitivamente por la cadena", () => {
    const tasks = [
      { id: "design", startDate: "2026-01-06", dueDate: "2026-01-25" },
      { id: "dev", startDate: "2026-01-15", dueDate: "2026-02-05" },
      { id: "qa", startDate: "2026-02-01", dueDate: "2026-02-10" },
    ];
    const edges = [
      { workItemId: "dev", dependsOnWorkItemId: "design" },
      { workItemId: "qa", dependsOnWorkItemId: "dev" },
    ];
    const result = cascadeForwardShift(tasks, edges, "design");
    expect(result).toEqual([
      { id: "dev", startDate: "2026-01-25", dueDate: "2026-02-15" },
      { id: "qa", startDate: "2026-02-15", dueDate: "2026-02-24" },
    ]);
  });

  it("con varios bloqueantes, manda el de fecha de fin más tardía", () => {
    const tasks = [
      { id: "copy", startDate: "2026-01-01", dueDate: "2026-01-10" },
      { id: "design", startDate: "2026-01-01", dueDate: "2026-01-30" }, // el más tardío
      { id: "dev", startDate: "2026-01-05", dueDate: "2026-01-20" },
    ];
    const edges = [
      { workItemId: "dev", dependsOnWorkItemId: "copy" },
      { workItemId: "dev", dependsOnWorkItemId: "design" },
    ];
    const result = cascadeForwardShift(tasks, edges, "design");
    expect(result).toEqual([{ id: "dev", startDate: "2026-01-30", dueDate: "2026-02-14" }]);
  });
});

describe("monthSegments", () => {
  it("un solo mes cuando el rango cae dentro de un mes calendario", () => {
    expect(monthSegments("2026-01-06", "2026-01-20")).toEqual([
      { label: "Enero 2026", startIso: "2026-01-01", days: 31 },
    ]);
  });

  it("un segmento por cada mes calendario completo que cruza el rango", () => {
    expect(monthSegments("2026-01-15", "2026-03-05")).toEqual([
      { label: "Enero 2026", startIso: "2026-01-01", days: 31 },
      { label: "Febrero 2026", startIso: "2026-02-01", days: 28 },
      { label: "Marzo 2026", startIso: "2026-03-01", days: 31 },
    ]);
  });

  it("cruza el límite de año correctamente", () => {
    expect(monthSegments("2026-12-10", "2027-01-15")).toEqual([
      { label: "Diciembre 2026", startIso: "2026-12-01", days: 31 },
      { label: "Enero 2027", startIso: "2027-01-01", days: 31 },
    ]);
  });

  it("respeta años bisiestos", () => {
    expect(monthSegments("2028-02-01", "2028-02-28")).toEqual([
      { label: "Febrero 2028", startIso: "2028-02-01", days: 29 },
    ]);
  });
});
