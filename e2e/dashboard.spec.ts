import { expect, test } from "@playwright/test";

test.describe("Dashboard @smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "KeenAI" })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("demo login redirects to inbox", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@keenai.local");
    await page.getByLabel("Password").fill("keenai-demo-12");
    await page.getByLabel("Organization").fill("demo");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/inbox/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  });
});
