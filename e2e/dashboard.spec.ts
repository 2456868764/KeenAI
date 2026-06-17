import { expect, test } from "@playwright/test";
import { expectPageTitle, loginAsDemo } from "./helpers/dashboard-auth";

test.describe("Dashboard @smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "KeenAI" })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("demo login redirects to inbox", async ({ page }) => {
    await loginAsDemo(page);
    await expectPageTitle(page, "Inbox");
  });

  test("sla settings page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings/sla");
    await expect(page.getByRole("heading", { name: "Policies" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Office hours" })).toBeVisible();
  });

  test("workflows page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/workflows");
    await expectPageTitle(page, "Workflows");
    await expect(page.getByRole("button", { name: /new workflow/i })).toBeVisible();
  });

  test("tickets page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/tickets");
    await expectPageTitle(page, "Tickets");
    await expect(page.getByRole("heading", { name: "Ticket types" })).toBeVisible();
  });

  test("analytics page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/analytics");
    await expectPageTitle(page, "Analytics");
    await expect(page.getByText("Support")).toBeVisible();
  });

  test("feedback page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/feedback");
    await expectPageTitle(page, "Feedback");
  });

  test("roadmap page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/roadmap");
    await expectPageTitle(page, "Roadmap");
    await expect(page.getByRole("button", { name: /add item/i })).toBeVisible();
  });

  test("changelog page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/changelog");
    await expectPageTitle(page, "Changelog");
    await expect(page.getByRole("button", { name: /new entry/i })).toBeVisible();
  });

  test("help center page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/help-center");
    await expectPageTitle(page, "Help Center");
  });

  test("brands settings page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings/brands");
    await expectPageTitle(page, "Settings");
    await expect(page.getByRole("button", { name: /add brand/i })).toBeVisible();
  });

  test("personality settings page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings/personality");
    await expectPageTitle(page, "Settings");
    await expect(page.getByRole("heading", { name: "Agent identity" })).toBeVisible();
    await expect(page.getByRole("button", { name: /save personality/i })).toBeVisible();
  });

  test("custom actions page loads after login", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/custom-actions");
    await expectPageTitle(page, "Custom Actions");
    await expect(page.getByRole("button", { name: /new action/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "MCP Host (consume external tools)" }),
    ).toBeVisible();
  });
});
