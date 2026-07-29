import { describe, expect, it } from "vitest";
import {
  deriveStatusFromClientResponse,
  isValidQuoteStatus,
  QUOTE_STATUSES,
  SYSTEM_QUOTE_STATUS_SEED,
  canTransition,
} from "./quote-status";

describe("QUOTE_STATUSES / isValidQuoteStatus", () => {
  it("lists the 8 system statuses of the domain", () => {
    expect(QUOTE_STATUSES).toHaveLength(8);
    expect(QUOTE_STATUSES).toEqual([
      "draft",
      "sent",
      "under_review",
      "modified",
      "accepted",
      "rejected",
      "purchased",
      "closed",
    ]);
  });

  it("validates known statuses only", () => {
    expect(isValidQuoteStatus("draft")).toBe(true);
    expect(isValidQuoteStatus("closed")).toBe(true);
    expect(isValidQuoteStatus("cancelled")).toBe(false);
  });
});

describe("SYSTEM_QUOTE_STATUS_SEED", () => {
  // Debe espejar 1:1 los códigos de QUOTE_STATUSES (y el seed SQL de la migración).
  it("cubre los 8 códigos de sistema, en el mismo orden que sort_order", () => {
    expect(SYSTEM_QUOTE_STATUS_SEED.map((s) => s.code)).toEqual([
      "draft",
      "sent",
      "under_review",
      "modified",
      "accepted",
      "rejected",
      "purchased",
      "closed",
    ]);
    // mismo conjunto que QUOTE_STATUSES
    expect(new Set(SYSTEM_QUOTE_STATUS_SEED.map((s) => s.code))).toEqual(new Set(QUOTE_STATUSES));
  });

  it("cada estado tiene color hex válido y sortOrder creciente", () => {
    let prev = -1;
    for (const s of SYSTEM_QUOTE_STATUS_SEED) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.sortOrder).toBeGreaterThan(prev);
      prev = s.sortOrder;
    }
  });

  it("'closed' es el único sólido y 'purchased' se llama 'Contrato firmado'", () => {
    const closed = SYSTEM_QUOTE_STATUS_SEED.find((s) => s.code === "closed");
    const purchased = SYSTEM_QUOTE_STATUS_SEED.find((s) => s.code === "purchased");
    expect(closed?.isSolid).toBe(true);
    expect(SYSTEM_QUOTE_STATUS_SEED.filter((s) => s.isSolid)).toHaveLength(1);
    expect(purchased?.label).toBe("Contrato firmado");
  });
});

describe("canTransition", () => {
  // Paridad con producción: el Kanban permite mover libremente entre columnas
  // (solo se valida permiso de rol, no la transición). Con estados administrables
  // ya no se limita a los 9 de sistema.
  it("sin validCodes: permite cualquier par de códigos no vacíos", () => {
    expect(canTransition("closed", "draft")).toBe(true);
    expect(canTransition("draft", "mi_estado_custom")).toBe(true);
    expect(canTransition("accepted", "accepted")).toBe(true);
  });

  it("sin validCodes: rechaza códigos vacíos", () => {
    expect(canTransition("", "draft")).toBe(false);
    expect(canTransition("draft", "")).toBe(false);
  });

  it("con validCodes: valida contra el catálogo de la organización", () => {
    const valid = new Set(["draft", "sent", "mi_estado_custom"]);
    expect(canTransition("draft", "mi_estado_custom", valid)).toBe(true);
    expect(canTransition("draft", "closed", valid)).toBe(false);
    expect(canTransition("cancelled", "draft", valid)).toBe(false);
  });
});

describe("deriveStatusFromClientResponse", () => {
  // Extraído de submitResponse() en js/respuesta.js: precedencia
  // changes > (todos accepted) > rejected > under_review.
  it("returns 'modified' when any item has changes requested", () => {
    expect(deriveStatusFromClientResponse(["accepted", "changes", "rejected"])).toBe("modified");
  });

  it("returns 'accepted' when every item is accepted", () => {
    expect(deriveStatusFromClientResponse(["accepted", "accepted"])).toBe("accepted");
  });

  it("returns 'rejected' when at least one item is rejected and none has changes", () => {
    expect(deriveStatusFromClientResponse(["accepted", "rejected"])).toBe("rejected");
  });

  it("returns 'under_review' otherwise (e.g. some items still pending)", () => {
    expect(deriveStatusFromClientResponse(["accepted", "pending"])).toBe("under_review");
  });
});
