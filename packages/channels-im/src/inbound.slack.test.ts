import { describe, expect, it } from "vitest";
import { adaptSlackEvent, slackUrlVerificationChallenge } from "./inbound/slack.js";
import { planSlackOutbound } from "./outbound/slack.js";

describe("adaptSlackEvent", () => {
  it("normalizes block action interactions", () => {
    expect(
      adaptSlackEvent({
        type: "block_actions",
        user: { id: "U1" },
        channel: { id: "C1" },
        container: { message_ts: "123.45", channel_id: "C1" },
        actions: [{ action_id: "sales", value: "sales" }],
      }),
    ).toMatchObject({
      conversationKey: "C1:123.45",
      channelId: "C1",
      providerThreadId: "123.45",
      userId: "U1",
      replyToMessageId: "123.45",
      interaction: { type: "button", id: "sales" },
    });
  });
  it("keeps separate clicks on the same Slack button distinct", () => {
    const payload = {
      type: "block_actions",
      user: { id: "U1" },
      channel: { id: "C1" },
      container: { message_ts: "123.45", channel_id: "C1" },
      actions: [{ action_id: "sales", value: "sales" }],
    };
    expect(adaptSlackEvent({ ...payload, trigger_id: "trigger-1" })?.platformMessageId).not.toBe(
      adaptSlackEvent({ ...payload, trigger_id: "trigger-2" })?.platformMessageId,
    );
  });
  it("returns challenge for url verification", () => {
    expect(slackUrlVerificationChallenge({ type: "url_verification", challenge: "abc" })).toBe(
      "abc",
    );
  });

  it("parses file_share message with image", () => {
    const result = adaptSlackEvent({
      type: "event_callback",
      team_id: "T123",
      event: {
        type: "message",
        subtype: "file_share",
        channel: "C123",
        user: "U456",
        ts: "1234.5678",
        files: [
          {
            id: "F789",
            name: "screenshot.png",
            mimetype: "image/png",
            size: 12_345,
            url_private_download: "https://files.slack.com/secret",
          },
        ],
      },
    });

    expect(result?.channelType).toBe("slack");
    expect(result?.channelId).toBe("C123");
    expect(result?.conversationKey).toBe("C123:1234.5678");
    expect(result?.providerThreadId).toBe("1234.5678");
    expect(result?.messageKind).toBe("photo");
    expect(result?.attachments[0]?.platformRef).toContain("slack.com");
    expect(result?.conversationAttributes).toEqual({ teamId: "T123" });
  });

  it("routes replies to the same Slack thread and keeps separate roots isolated", () => {
    const root = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "C1",
        channel_type: "channel",
        user: "U1",
        ts: "100.1",
        text: "Root",
      },
    });
    const reply = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "C1",
        channel_type: "channel",
        user: "U2",
        ts: "100.2",
        thread_ts: "100.1",
        text: "Reply",
      },
    });
    const anotherRoot = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "C1",
        channel_type: "channel",
        user: "U3",
        ts: "200.1",
        text: "Another root",
      },
    });

    expect(root?.conversationKey).toBe("C1:100.1");
    expect(reply?.conversationKey).toBe(root?.conversationKey);
    expect(reply?.providerThreadId).toBe("100.1");
    expect(anotherRoot?.conversationKey).toBe("C1:200.1");
  });

  it("keeps unthreaded direct messages in one Slack conversation", () => {
    const first = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "D1",
        channel_type: "im",
        user: "U1",
        ts: "100.1",
        text: "First",
      },
    });
    const second = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "D1",
        channel_type: "im",
        user: "U1",
        ts: "100.2",
        text: "Second",
      },
    });

    expect(first?.conversationKey).toBe("D1");
    expect(second?.conversationKey).toBe("D1");
    expect(first?.providerThreadId).toBeUndefined();
  });

  it("ignores bot messages", () => {
    const result = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "C1",
        ts: "1.0",
        bot_id: "B1",
        text: "automated",
      },
    });
    expect(result).toBeNull();
  });

  it("normalizes edits, deletes, and reactions as mutations", () => {
    const edited = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        subtype: "message_changed",
        channel: "C1",
        message: { ts: "100.1", user: "U1", text: "Corrected", files: [] },
      },
    });
    const deleted = adaptSlackEvent({
      type: "event_callback",
      event: { type: "message", subtype: "message_deleted", channel: "C1", deleted_ts: "100.1" },
    });
    const reacted = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "reaction_added",
        user: "U2",
        reaction: "thumbsup",
        item: { type: "message", channel: "C1", ts: "100.1" },
      },
    });

    expect(edited?.mutation).toEqual({
      type: "message.updated",
      targetProviderMessageId: "100.1",
      replaceAttachments: true,
    });
    expect(deleted?.mutation).toEqual({
      type: "message.deleted",
      targetProviderMessageId: "100.1",
    });
    expect(reacted?.mutation).toEqual({
      type: "reaction.added",
      targetProviderMessageId: "100.1",
      actorId: "U2",
      emoji: ":thumbsup:",
    });
  });
});

describe("planSlackOutbound", () => {
  it("uploads files after optional text", () => {
    const actions = planSlackOutbound({
      platform: "slack",
      targetId: "C123",
      parts: [
        { type: "text", text: "Invoice attached." },
        { type: "file", attachmentId: "att1", fileName: "invoice.pdf" },
      ],
      attachments: new Map([
        [
          "att1",
          {
            attachmentId: "att1",
            contentUrl: "https://api.example/attachments/att1/content",
            contentType: "application/pdf",
            fileName: "invoice.pdf",
          },
        ],
      ]),
    });

    expect(actions).toHaveLength(2);
    expect(actions[0]?.method).toBe("chat.postMessage");
    expect(actions[1]).toMatchObject({
      method: "files.uploadV2",
      fileName: "invoice.pdf",
      contentType: "application/pdf",
    });
  });
});
