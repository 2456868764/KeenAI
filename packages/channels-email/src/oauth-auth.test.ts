import { afterEach, describe, expect, it, vi } from "vitest";

const { imapConstructor } = vi.hoisted(() => ({ imapConstructor: vi.fn() }));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor(options: unknown) {
      imapConstructor(options);
    }
    async connect() {}
    async logout() {}
  },
}));

import { createImapPollClient } from "./imap-poll.js";
import { createSmtpTransport } from "./outbound.js";
import { createEmailChannelPlugin } from "./plugin.js";

afterEach(() => imapConstructor.mockClear());

describe("email protocol authentication", () => {
  it("passes OAuth2 access tokens to SMTP and IMAP instead of passwords", async () => {
    const smtp = createSmtpTransport({
      host: "smtp.example.com",
      port: 465,
      user: "support@example.com",
      pass: "stale-password",
      accessToken: "oauth-access",
      from: "support@example.com",
    });
    expect((smtp.options as { auth?: unknown }).auth).toEqual({
      type: "OAuth2",
      user: "support@example.com",
      accessToken: "oauth-access",
    });
    smtp.close();

    const imap = await createImapPollClient({
      host: "imap.example.com",
      user: "support@example.com",
      password: "stale-password",
      accessToken: "oauth-access",
    });
    expect(imapConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { user: "support@example.com", accessToken: "oauth-access" },
      }),
    );
    await imap.close();
  });

  it("keeps password authentication for conventional mail servers", async () => {
    const smtp = createSmtpTransport({
      host: "smtp.example.com",
      port: 587,
      user: "support@example.com",
      pass: "password",
      from: "support@example.com",
    });
    expect((smtp.options as { auth?: unknown }).auth).toEqual({
      user: "support@example.com",
      pass: "password",
    });
    smtp.close();
    const imap = await createImapPollClient({
      host: "imap.example.com",
      user: "support@example.com",
      password: "password",
    });
    expect(imapConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: "support@example.com", pass: "password" } }),
    );
    await imap.close();
  });

  it("retries transient SMTP failures and terminates permanent failures", () => {
    const plugin = createEmailChannelPlugin();
    expect(plugin.classifyError({ responseCode: 421 })).toMatchObject({
      disposition: "retryable",
      code: "smtp_421",
    });
    expect(plugin.classifyError({ responseCode: 535 })).toMatchObject({
      disposition: "terminal",
      code: "smtp_535",
    });
    expect(plugin.classifyError({ code: "ECONNECTION" })).toMatchObject({
      disposition: "retryable",
      code: "econnection",
    });
    expect(plugin.classifyError({ code: "EAUTH" })).toMatchObject({
      disposition: "terminal",
      code: "eauth",
    });
    expect(plugin.classifyError({ code: "ETIMEDOUT" })).toMatchObject({
      disposition: "unknown_after_send",
      code: "unknown_after_send",
    });
  });
});
