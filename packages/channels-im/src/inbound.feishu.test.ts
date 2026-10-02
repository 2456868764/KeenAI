import { describe, expect, it } from "vitest";
import { adaptFeishuEvent, feishuUrlVerificationChallenge } from "./inbound/feishu.js";

describe("adaptFeishuEvent", () => {
  it("normalizes card action interactions", () => {
    expect(
      adaptFeishuEvent({
        schema: "2.0",
        header: { event_id: "event-1", event_type: "card.action.trigger" },
        event: {
          context: { open_message_id: "om-1", open_chat_id: "oc-1" },
          operator: { operator_id: { open_id: "ou-1" } },
          action: { value: { keenai_button_id: "sales" } },
        },
      }),
    ).toMatchObject({
      platformMessageId: "event-1",
      channelId: "oc-1",
      userId: "ou-1",
      replyToMessageId: "om-1",
      interaction: { type: "button", id: "sales" },
    });
  });
  it("returns challenge for url verification", () => {
    expect(feishuUrlVerificationChallenge({ type: "url_verification", challenge: "abc" })).toBe(
      "abc",
    );
  });

  it("parses im.message.receive_v1 text events", () => {
    const parsed = adaptFeishuEvent({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", event_id: "evt-1" },
      event: {
        sender: { sender_id: { open_id: "ou_123" } },
        message: {
          message_id: "om_1",
          chat_id: "oc_456",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "Need help with billing" }),
        },
      },
    });

    expect(parsed?.channelType).toBe("feishu");
    expect(parsed?.channelId).toBe("oc_456");
    expect(parsed?.conversationKey).toBe("oc_456:om_1");
    expect(parsed?.providerThreadId).toBe("om_1");
    expect(parsed?.plainText).toBe("Need help with billing");
  });

  it("routes Feishu group replies by root while keeping p2p chats continuous", () => {
    const groupReply = adaptFeishuEvent({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", event_id: "evt-reply" },
      event: {
        sender: { sender_id: { open_id: "ou_123" } },
        message: {
          message_id: "om_reply",
          chat_id: "oc_group",
          chat_type: "group",
          root_id: "om_root",
          parent_id: "om_parent",
          message_type: "text",
          content: JSON.stringify({ text: "Thread reply" }),
        },
      },
    });
    const direct = adaptFeishuEvent({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", event_id: "evt-direct" },
      event: {
        sender: { sender_id: { open_id: "ou_123" } },
        message: {
          message_id: "om_direct",
          chat_id: "oc_direct",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "Direct" }),
        },
      },
    });

    expect(groupReply).toMatchObject({
      conversationKey: "oc_group:om_root",
      providerThreadId: "om_root",
      replyToMessageId: "om_parent",
    });
    expect(direct?.conversationKey).toBe("oc_direct");
    expect(direct?.providerThreadId).toBeUndefined();
  });

  it("normalizes message resources for durable image download", () => {
    const parsed = adaptFeishuEvent({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", event_id: "evt-image" },
      event: {
        sender: { sender_id: { open_id: "ou_123" } },
        message: {
          message_id: "om_image_1",
          chat_id: "oc_456",
          message_type: "image",
          content: JSON.stringify({ image_key: "img_1" }),
        },
      },
    });

    expect(parsed?.messageKind).toBe("photo");
    expect(parsed?.parts).toEqual([{ type: "image", attachmentId: "pending-0" }]);
    expect(JSON.parse(parsed?.attachments[0]?.platformRef ?? "{}")).toEqual({
      messageId: "om_image_1",
      resourceKey: "img_1",
      resourceType: "image",
    });
  });

  it("normalizes post rich text and embedded images", () => {
    const parsed = adaptFeishuEvent({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", event_id: "evt-post" },
      event: {
        sender: { sender_id: { open_id: "ou_123" } },
        message: {
          message_id: "om_post",
          chat_id: "oc_456",
          message_type: "post",
          content: JSON.stringify({
            zh_cn: {
              title: "Release",
              content: [
                [{ tag: "text", text: "Version 2 is live" }],
                [{ tag: "img", image_key: "img_post_1" }],
              ],
            },
          }),
        },
      },
    });

    expect(parsed?.plainText).toBe("Release\nVersion 2 is live");
    expect(parsed?.messageKind).toBe("photo");
    expect(parsed?.attachments).toHaveLength(1);
    expect(parsed?.parts).toContainEqual({ type: "image", attachmentId: "pending-0" });
  });

  it("normalizes reaction and recall lifecycle events", () => {
    expect(
      adaptFeishuEvent({
        header: { event_type: "im.message.reaction.created_v1", event_id: "evt-reaction" },
        event: {
          message_id: "om_1",
          reaction_type: { emoji_type: "THUMBSUP" },
          user_id: { open_id: "ou_2" },
        },
      })?.mutation,
    ).toEqual({
      type: "reaction.added",
      targetProviderMessageId: "om_1",
      actorId: "ou_2",
      emoji: "THUMBSUP",
    });
    expect(
      adaptFeishuEvent({
        header: { event_type: "im.message.recalled_v1", event_id: "evt-recall" },
        event: { message_id: "om_1" },
      })?.mutation,
    ).toEqual({ type: "message.deleted", targetProviderMessageId: "om_1" });
  });
});
