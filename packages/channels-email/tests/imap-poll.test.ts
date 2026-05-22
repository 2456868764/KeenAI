import { describe, expect, it } from "vitest";
import { pollImapMailboxes } from "../src/imap-poll.js";

describe("pollImapMailboxes", () => {
  it("skips when IMAP is not configured", async () => {
    const result = await pollImapMailboxes();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("imap_not_configured");
    expect(result.polled).toBe(0);
  });

  it("returns zero counts when configured (stub)", async () => {
    const result = await pollImapMailboxes({
      host: "imap.example.com",
      user: "support@example.com",
      password: "secret",
    });
    expect(result.skipped).toBe(false);
    expect(result.polled).toBe(0);
    expect(result.ingested).toBe(0);
  });
});
