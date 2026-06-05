import { describe, expect, it } from "vitest";
import { renderTicketStatusEmail } from "./ticket-status.js";

describe("renderTicketStatusEmail", () => {
  it("renders en and zh subjects", () => {
    const en = renderTicketStatusEmail({
      ticketTitle: "Billing issue",
      statusName: "Done",
      portalUrl: "https://portal.example/tickets/1",
      locale: "en",
    });
    expect(en.subject).toContain("Billing issue");
    expect(en.html).toContain("View in portal");

    const zh = renderTicketStatusEmail({
      ticketTitle: "账单问题",
      statusName: "已完成",
      locale: "zh",
    });
    expect(zh.subject).toContain("账单问题");
    expect(zh.html).toContain("您的工单状态已更新");
  });
});
