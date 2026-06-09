import { type Page, expect } from "@playwright/test";

export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@keenai.local");
  await page.getByLabel("Password").fill("keenai-demo-12");
  await page.getByLabel("Organization").fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/inbox/, { timeout: 30_000 });
}

/** App header page title (distinct from nav links). */
export async function expectPageTitle(page: Page, title: string): Promise<void> {
  await expect(page.locator("header span.text-sm.font-medium", { hasText: title })).toBeVisible();
}
