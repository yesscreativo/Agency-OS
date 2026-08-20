import { describe, it, expect } from "vitest";
import { projectProgress, validateWorkItemTitle, WORK_ITEM_PRIORITIES } from "./work-item";

describe("projectProgress", () => {
  it("0% sin tareas", () => expect(projectProgress([])).toBe(0));
  it("50% con la mitad hechas", () =>
    expect(projectProgress([{ statusIsDone: true }, { statusIsDone: false }])).toBe(50));
  it("100% todas hechas", () =>
    expect(projectProgress([{ statusIsDone: true }, { statusIsDone: true }])).toBe(100));
  it("redondea", () =>
    expect(projectProgress([{ statusIsDone: true }, { statusIsDone: false }, { statusIsDone: false }])).toBe(33));
});

describe("validateWorkItemTitle", () => {
  it("rechaza vacío", () => expect(validateWorkItemTitle("  ").valid).toBe(false));
  it("acepta con texto", () => expect(validateWorkItemTitle("Diseño de landing").valid).toBe(true));
});

describe("prioridades", () => {
  it("son 4", () => expect(WORK_ITEM_PRIORITIES).toHaveLength(4));
});
