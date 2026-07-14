import { describe, expect, it } from "vitest";
import { DOMAIN_PACKAGE_READY } from "./index";

describe("scaffold", () => {
  it("runs vitest against packages/domain", () => {
    expect(DOMAIN_PACKAGE_READY).toBe(true);
  });
});
