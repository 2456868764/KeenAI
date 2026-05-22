import { describe, expect, it, vi } from "vitest";
import { pollImapMailboxes } from "../src/imap-poll.js";

describe("pollImapMailboxes", () => {
  it("skips when IMAP is not configured", async () => {
    const result = await pollImapMailboxes();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("imap_not_configured");
    expect(result.polled).toBe(0);
  });

  it("returns unseen count from imap client", async () => {
    const createClient = vi.fn(async () => ({
      pollUnseen: vi.fn(async () => ({ polled: 3 })),
      close: vi.fn(async () => {}),
    }));

    const result = await pollImapMailboxes(
      {
        host: "imap.example.com",
        user: "support@example.com",
        password: "secret",
        mailbox: "INBOX",
      },
      { createClient },
    );

    expect(result.skipped).toBe(false);
    expect(result.polled).toBe(3);
    expect(result.ingested).toBe(0);
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("closes client when poll throws", async () => {
    const close = vi.fn(async () => {});
    const createClient = vi.fn(async () => ({
      pollUnseen: vi.fn(async () => {
        throw new Error("network");
      }),
      close,
    }));

    await expect(
      pollImapMailboxes(
        { host: "imap.example.com", user: "support@example.com" },
        { createClient },
      ),
    ).rejects.toThrow("network");

    expect(close).toHaveBeenCalledOnce();
  });
});
