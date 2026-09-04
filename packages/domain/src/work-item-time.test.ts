import { describe, expect, it } from "vitest";
import { groupMinutesByUser, groupTimeByClient, sumMinutes } from "./work-item-time";

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

describe("groupTimeByClient", () => {
  it("agrupa por cliente y por proyecto dentro del cliente, orden desc", () => {
    const out = groupTimeByClient([
      { clientId: "c1", clientName: "Cortex", projectId: "p1", projectTitle: "Web", minutes: 30 },
      { clientId: "c1", clientName: "Cortex", projectId: "p2", projectTitle: "App", minutes: 90 },
      { clientId: "c2", clientName: "Novatel", projectId: "p3", projectTitle: "Ads", minutes: 15 },
      { clientId: "c1", clientName: "Cortex", projectId: "p1", projectTitle: "Web", minutes: 10 },
    ]);
    expect(out).toEqual([
      {
        clientId: "c1",
        clientName: "Cortex",
        minutes: 130,
        projects: [
          { projectId: "p2", projectTitle: "App", minutes: 90 },
          { projectId: "p1", projectTitle: "Web", minutes: 40 },
        ],
      },
      {
        clientId: "c2",
        clientName: "Novatel",
        minutes: 15,
        projects: [{ projectId: "p3", projectTitle: "Ads", minutes: 15 }],
      },
    ]);
  });

  it("es [] sin entradas", () => {
    expect(groupTimeByClient([])).toEqual([]);
  });
});
