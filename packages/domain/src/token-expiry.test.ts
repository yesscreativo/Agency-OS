import { describe, expect, it } from "vitest";
import {
  CLIENT_TOKEN_EXPIRY_DAYS,
  SUPPLIER_TOKEN_EXPIRY_DAYS,
  isTokenExpired,
} from "./token-expiry";

describe("expiry constants", () => {
  it("matches the business rule: cliente 5 días, proveedor 30 días", () => {
    expect(CLIENT_TOKEN_EXPIRY_DAYS).toBe(5);
    expect(SUPPLIER_TOKEN_EXPIRY_DAYS).toBe(30);
  });
});

describe("isTokenExpired", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("is false when there is no expiry set", () => {
    expect(isTokenExpired(null, now)).toBe(false);
    expect(isTokenExpired(undefined, now)).toBe(false);
  });

  it("is true when expires_at is in the past", () => {
    expect(isTokenExpired("2026-03-09T00:00:00Z", now)).toBe(true);
  });

  it("is false when expires_at is in the future", () => {
    expect(isTokenExpired("2026-03-11T00:00:00Z", now)).toBe(false);
  });
});
