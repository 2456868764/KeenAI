import { describe, expect, it, vi } from "vitest";
import { pollImapMailboxes } from "../src/imap-poll.js";

describe("pollImapMailboxes", () => {
  it("skips when IMAP is not configured", async () => {
    const result = await pollImapMailboxes();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("imap_not_configured");
    expect(result.polled).toBe(0);
  });

  it("fetches unseen messages and calls onMessage", async () => {
    const source = Buffer.from("raw mime");
    const createClient = vi.fn(async () => ({
      fetchUnseen: vi.fn(async () => [{ uid: 42, source }]),
      markSeen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    }));

    const onMessage = vi.fn(async () => {});

    const result = await pollImapMailboxes(
      {
        host: "imap.example.com",
        user: "support@example.com",
        password: "secret",
        mailbox: "INBOX",
      },
      { createClient },
      { onMessage },
    );

    expect(result.skipped).toBe(false);
    expect(result.polled).toBe(1);
    expect(result.ingested).toBe(1);
    expect(onMessage).toHaveBeenCalledWith({ uid: 42, source });
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("does not mark seen when onMessage fails", async () => {
    const markSeen = vi.fn(async () => {});
    const createClient = vi.fn(async () => ({
      fetchUnseen: vi.fn(async () => [{ uid: 7, source: Buffer.from("x") }]),
      markSeen,
      close: vi.fn(async () => {}),
    }));

    await pollImapMailboxes(
      { host: "imap.example.com", user: "support@example.com" },
      { createClient },
      {
        onMessage: vi.fn(async () => {
          throw new Error("ingest failed");
        }),
      },
    );

    expect(markSeen).not.toHaveBeenCalled();
  });

  it("closes client when fetch throws", async () => {
    const close = vi.fn(async () => {});
    const createClient = vi.fn(async () => ({
      fetchUnseen: vi.fn(async () => {
        throw new Error("network");
      }),
      markSeen: vi.fn(async () => {}),
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
