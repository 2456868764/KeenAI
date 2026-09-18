import { describe, expect, it } from "vitest";
import { parseWhatsAppDeliveryReceipts } from "./inbound/whatsapp.js";

describe("WhatsApp delivery receipts", () => {
  it("normalizes delivered and failed statuses", () => {
    const receipts = parseWhatsAppDeliveryReceipts({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.1", status: "delivered", timestamp: "1700000000" },
                  {
                    id: "wamid.2",
                    status: "failed",
                    timestamp: "1700000001",
                    errors: [{ code: 131047, title: "Re-engagement message" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({ providerMessageId: "wamid.1", status: "delivered" });
    expect(receipts[1]).toMatchObject({
      providerMessageId: "wamid.2",
      status: "failed",
      errorCode: "131047",
    });
  });
});
