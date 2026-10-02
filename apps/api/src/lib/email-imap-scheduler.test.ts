import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startEmailImapPollScheduler } from "./email-imap-scheduler.js";

vi.mock("./email-imap-poll.js", () => ({
  runEmailImapPoll: vi.fn(async () => ({
    polled: 1,
    ingested: 1,
    oversized: 0,
    connections: 1,
    failedConnections: 0,
    skipped: false,
  })),
}));

import { runEmailImapPoll } from "./email-imap-poll.js";

describe("startEmailImapPollScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts polling immediately and continues on the configured interval", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const stop = startEmailImapPollScheduler(
      {
        store: {} as never,
        fts: {} as never,
        authConfig: {} as never,
        env: {} as never,
        log: log as never,
        startedAt: new Date(),
      },
      1,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runEmailImapPoll).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runEmailImapPoll).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledTimes(2);
    stop();
  });
});
