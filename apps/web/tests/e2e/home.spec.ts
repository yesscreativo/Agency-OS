import { test, expect } from "@playwright/test";

test("home page renders the scaffold placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Agency OS" })).toBeVisible();
});
