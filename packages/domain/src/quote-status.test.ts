import { describe, expect, it } from "vitest";
import {
  deriveStatusFromClientResponse,
  isValidQuoteStatus,
  QUOTE_STATUSES,
  canTransition,
} from "./quote-status";

describe("QUOTE_STATUSES / isValidQuoteStatus", () => {
  it("lists the 9 statuses of the domain", () => {
    expect(QUOTE_STATUSES).toHaveLength(9);
    expect(QUOTE_STATUSES).toEqual([
      "draft",
      "review_future",
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

describe("canTransition", () => {
  // Paridad exacta con producción: el Kanban actual permite mover una cotización
  // a cualquiera de las 9 columnas libremente (solo se valida permiso de rol,
  // no la transición en sí). No se introduce una restricción nueva aquí.
  it("allows any transition between valid statuses", () => {
    expect(canTransition("closed", "draft")).toBe(true);
    expect(canTransition("draft", "purchased")).toBe(true);
    expect(canTransition("accepted", "accepted")).toBe(true);
  });

  it("rejects transitions involving an invalid status", () => {
    expect(canTransition("draft", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
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
