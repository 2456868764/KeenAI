import { describe, expect, it } from "vitest";
import { renderTicketStatusEmail } from "./ticket-status.js";

describe("renderTicketStatusEmail", () => {
  it("renders en and zh subjects with React Email HTML", async () => {
    const en = await renderTicketStatusEmail({
      ticketTitle: "Billing issue",
      statusName: "Done",
      portalUrl: "https://portal.example/tickets/1",
      locale: "en",
    });
    expect(en.subject).toContain("Billing issue");
    expect(en.html).toContain("View in portal");
    expect(en.html).toContain("<!DOCTYPE html");

    const zh = await renderTicketStatusEmail({
      ticketTitle: "账单问题",
      statusName: "已完成",
      locale: "zh",
    });
    expect(zh.subject).toContain("账单问题");
    expect(zh.html).toContain("您的工单状态已更新");
  });
});
