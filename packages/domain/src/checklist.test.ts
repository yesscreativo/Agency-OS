import { describe, it, expect } from "vitest";
import { checklistProgress } from "./checklist";

describe("checklistProgress", () => {
  it("vacío: 0/0", () => {
    expect(checklistProgress([])).toEqual({ completed: 0, total: 0 });
  });

  it("cuenta completados y total", () => {
    const items = [
      { isCompleted: true },
      { isCompleted: false },
      { isCompleted: true },
    ];
    expect(checklistProgress(items)).toEqual({ completed: 2, total: 3 });
  });

  it("todos completados", () => {
    const items = [{ isCompleted: true }, { isCompleted: true }];
    expect(checklistProgress(items)).toEqual({ completed: 2, total: 2 });
  });

  it("ninguno completado", () => {
    const items = [{ isCompleted: false }, { isCompleted: false }];
    expect(checklistProgress(items)).toEqual({ completed: 0, total: 2 });
  });
});
