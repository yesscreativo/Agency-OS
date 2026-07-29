import { test, expect } from "@playwright/test";

// Credenciales del usuario de prueba leídas de env — nunca hardcodeadas, este
// repo es público. Ver apps/web/.env.local (gitignored).
const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL;
const TEST_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.skip(
  !TEST_EMAIL || !TEST_PASSWORD,
  "Faltan E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD en el entorno (ver .env.local)",
);

test("redirects unauthenticated users from / to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("logs in, shows the RBAC shell, and logs out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL!);
  await page.getByLabel("Contraseña").fill(TEST_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Tras el login se entra al hub (/inicio); la navegación por módulo ya no
  // vive en la shell global (ver refactor RBAC multi-módulo). La shell muestra
  // el nombre del usuario autenticado.
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole("heading", { name: /^Hola,/ })).toBeVisible();
  await expect(page.getByText("Yesid Parra")).toBeVisible();

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("rejects wrong credentials with an error message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL!);
  await page.getByLabel("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Credenciales inválidas")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
