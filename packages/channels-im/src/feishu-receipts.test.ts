import { describe, expect, it } from "vitest";
import { parseFeishuDeliveryReceipts } from "./inbound/feishu.js";

describe("Feishu delivery receipts", () => {
  it("normalizes message read events", () => {
    const receipts = parseFeishuDeliveryReceipts({
      header: { event_type: "im.message.message_read_v1", event_id: "event-1" },
      event: {
        message_id_list: ["message-1", "message-2"],
        read_time: "1789720000000",
      },
    });

    expect(receipts.map((receipt) => receipt.providerMessageId)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(receipts.every((receipt) => receipt.status === "read")).toBe(true);
    expect(receipts[0]?.occurredAt.toISOString()).toBe("2026-09-18T08:26:40.000Z");
  });
});
