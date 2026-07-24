import { describe, expect, it } from "vitest";
import { MAX_BRIEF_SIZE_BYTES, validateBriefSize, validateQuote } from "./quote-validation";

describe("validateQuote", () => {
  it("requires at least one item with a non-empty description", () => {
    const result = validateQuote({ items: [], recipients: [], isSending: false });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Agrega al menos un item con descripción");
  });

  it("rejects when every item has an empty description", () => {
    const result = validateQuote({
      items: [{ description: "" }, { description: "   " }],
      recipients: [],
      isSending: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Agrega al menos un item con descripción");
  });

  it("passes when at least one item (not necessarily the first) has a description", () => {
    const result = validateQuote({
      items: [{ description: "" }, { description: "Diseño de logo" }],
      recipients: [],
      isSending: false,
    });
    expect(result.errors).not.toContain("Agrega al menos un item con descripción");
  });

  it("requires at least one recipient only when sending", () => {
    const draft = validateQuote({
      items: [{ description: "Diseño de logo" }],
      recipients: [],
      isSending: false,
    });
    expect(draft.valid).toBe(true);

    const sending = validateQuote({
      items: [{ description: "Diseño de logo" }],
      recipients: [],
      isSending: true,
    });
    expect(sending.valid).toBe(false);
    expect(sending.errors).toContain("Agrega al menos un destinatario");
  });

  it("is valid with items and recipients when sending", () => {
    const result = validateQuote({
      items: [{ description: "Diseño de logo" }],
      recipients: [{ email: "cliente@example.com" }],
      isSending: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("validateBriefSize", () => {
  it("accepts files up to 10MB", () => {
    expect(validateBriefSize(MAX_BRIEF_SIZE_BYTES).valid).toBe(true);
  });

  it("rejects files over 10MB", () => {
    const result = validateBriefSize(MAX_BRIEF_SIZE_BYTES + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Archivo demasiado grande (máx 10MB)");
  });
});
