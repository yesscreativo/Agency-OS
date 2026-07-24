import { describe, expect, it } from "vitest";
import { isAllowedEmailDomain } from "./email-domain";

describe("isAllowedEmailDomain", () => {
  it("accepts emails from the agency domain", () => {
    expect(isAllowedEmailDomain("admin@laburuagencia.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAllowedEmailDomain("Admin@LaburuAgencia.COM")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isAllowedEmailDomain("  admin@laburuagencia.com  ")).toBe(true);
  });

  it("rejects other domains", () => {
    expect(isAllowedEmailDomain("someone@gmail.com")).toBe(false);
  });

  it("rejects lookalike domains that merely contain the suffix", () => {
    expect(isAllowedEmailDomain("admin@notlaburuagencia.com")).toBe(false);
  });
});
