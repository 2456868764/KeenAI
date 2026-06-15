import { expect, test } from "@playwright/test";

test.describe("Portal @smoke", () => {
  test("home page loads ticket portal", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "My tickets" })).toBeVisible();
  });

  test("help center page loads", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Help Center" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(page.getByLabel("Search help articles")).toBeVisible();
  });

  test("roadmap page loads", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page.getByRole("heading", { name: "Product roadmap" })).toBeVisible();
  });

  test("sitemap includes help routes", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain("/help");
  });

  test("robots.txt references sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text.toLowerCase()).toContain("sitemap");
  });
});
