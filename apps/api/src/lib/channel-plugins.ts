import {
  type ChannelConnectionConfig,
  type ChannelMessageOperation,
  type ChannelMessageOperationResult,
  ChannelPluginRegistry,
  type ChannelProviderMessageRef,
} from "@keenai/channels-core";
import { createEmailChannelPlugin } from "@keenai/channels-email";
import {
  type ImOutboundAction,
  createDefaultImPlugins,
  getImOutboundLimits,
} from "@keenai/channels-im";
import { createWidgetChannelPlugin } from "@keenai/channels-widget";
import {
  getDingTalkAccessToken,
  getFeishuTenantAccessToken,
  getWeChatAccessToken,
  getWeComAccessToken,
} from "./channel-provider-tokens.js";
import { publishConversation } from "./conversation-bus.js";

let registry: ChannelPluginRegistry | null = null;

export function getChannelPluginRegistry(): ChannelPluginRegistry {
  if (registry) return registry;
  const next = new ChannelPluginRegistry();
  for (const plugin of createDefaultImPlugins(executeImActions, executeImMessageOperation)) {
    next.register(plugin);
  }
  next.register(createEmailChannelPlugin());
  next.register(
    createWidgetChannelPlugin(
      async (envelope) => ({
        providerMessageIds: [envelope.messageId],
        acceptedAt: new Date(),
        providerResponse: { transport: "conversation_bus" },
      }),
      async (operation) => {
        const completedAt = new Date();
        if (operation.type === "typing") {
          publishConversation({
            type: "typing",
            conversationId: operation.conversationId,
            actorType: "agent",
            expiresAt: new Date(completedAt.getTime() + 5_000).toISOString(),
          });
        }
        return {
          completedAt,
          providerResponse: { transport: "conversation_bus" },
        };
      },
    ),
  );
  registry = next;
  return next;
}

export function resetChannelPluginRegistryForTests(): void {
  registry = null;
}

async function executeImActions(actions: ImOutboundAction[], connection: ChannelConnectionConfig) {
  const providerMessageIds: string[] = [];
  const providerMessageRefs: ChannelProviderMessageRef[] = [];
  const responses: unknown[] = [];
  for (const [index, action] of actions.entries()) {
    try {
      const result = await executeImAction(action, connection);
      responses.push(result.payload);
      const providerMessageId =
        result.providerMessageId ?? fallbackProviderMessageId(action, index);
      providerMessageIds.push(providerMessageId);
      providerMessageRefs.push({
        providerMessageId,
        providerAction: action.method,
        resourceType:
          action.platform === "slack" && action.method === "files.uploadV2" ? "file" : "message",
        actionIndex: index,
      });
    } catch (error) {
      if (responses.length > 0) {
        throw new ChannelPartialDeliveryError(
          index,
          providerMessageIds,
          providerMessageRefs,
          responses,
          error,
        );
      }
      throw error;
    }
  }
  return {
    providerMessageIds,
    providerMessageRefs,
    providerResponse: responses,
  };
}

function fallbackProviderMessageId(action: ImOutboundAction, actionIndex: number): string {
  if (action.platform === "dingtalk") {
    return `dingtalk:ack:${Date.now()}:${actionIndex}`;
  }
  throw new ChannelProviderHttpError(502, `${action.platform}_provider_message_id_missing`);
}

async function executeImMessageOperation(
  operation: ChannelMessageOperation,
  connection: ChannelConnectionConfig,
): Promise<ChannelMessageOperationResult> {
  let providerResponse: unknown;
  if (operation.channelType === "telegram") {
    const token = credential(connection, "botToken");
    const messageId = telegramMessageId(operation.providerMessageId);
    const body: Record<string, unknown> = {
      chat_id: operation.externalThreadId,
    };
    const businessConnectionId = operation.channelAttributes?.businessConnectionId;
    if (typeof businessConnectionId === "string" && businessConnectionId.trim()) {
      body.business_connection_id = businessConnectionId.trim();
    }
    let method: string;
    if (operation.type === "typing") {
      method = "sendChatAction";
      body.action = "typing";
    } else if (operation.type === "reaction.add" || operation.type === "reaction.remove") {
      method = "setMessageReaction";
      body.message_id = messageId;
      body.reaction =
        operation.type === "reaction.add" ? [{ type: "emoji", emoji: operation.emoji }] : [];
    } else if (operation.type === "edit") {
      method =
        operation.providerAction && operation.providerAction !== "sendMessage"
          ? "editMessageCaption"
          : "editMessageText";
      body.message_id = messageId;
      if (method === "editMessageCaption") {
        body.caption = operationTextWithinLimit(
          operation,
          getImOutboundLimits("telegram").maxCaptionCharacters ?? 1024,
          "telegram_edit_caption_too_long",
        );
      } else {
        body.text = operationTextWithinLimit(
          operation,
          getImOutboundLimits("telegram").maxTextCharacters ?? 4096,
          "telegram_edit_text_too_long",
        );
      }
    } else {
      method = "deleteMessage";
      body.message_id = messageId;
    }
    providerResponse = await postJson(`https://api.telegram.org/bot${token}/${method}`, body);
    assertTelegramOk(providerResponse, `telegram_${method}_failed`);
  } else if (operation.channelType === "slack") {
    const token = credential(connection, "botToken");
    const headers = { Authorization: `Bearer ${token}` };
    if (operation.type === "reaction.add" || operation.type === "reaction.remove") {
      providerResponse = await postJson(
        `https://slack.com/api/${operation.type === "reaction.add" ? "reactions.add" : "reactions.remove"}`,
        {
          channel: operation.externalThreadId,
          timestamp: operation.providerMessageId,
          name: slackEmojiName(operation.emoji),
        },
        headers,
      );
    } else if (operation.type === "edit") {
      providerResponse = await postJson(
        "https://slack.com/api/chat.update",
        {
          channel: operation.externalThreadId,
          ts: operation.providerMessageId,
          text: operationTextWithinLimit(
            operation,
            getImOutboundLimits("slack").maxTextCharacters ?? 4000,
            "slack_edit_text_too_long",
          ),
        },
        headers,
      );
    } else if (operation.type === "delete") {
      providerResponse =
        operation.providerResourceType === "file" || operation.providerAction === "files.uploadV2"
          ? await postJson(
              "https://slack.com/api/files.delete",
              { file: operation.providerMessageId },
              headers,
            )
          : await postJson(
              "https://slack.com/api/chat.delete",
              {
                channel: operation.externalThreadId,
                ts: operation.providerMessageId,
              },
              headers,
            );
    } else {
      throw new ChannelProviderHttpError(422, "slack_typing_not_supported");
    }
    assertProviderOk(providerResponse, `slack_${operation.type.replace(".", "_")}_failed`);
  } else if (operation.channelType === "discord") {
    const token = credential(connection, "botToken");
    const base = `https://discord.com/api/v10/channels/${encodeURIComponent(operation.externalThreadId)}`;
    const headers = { Authorization: `Bot ${token}` };
    if (operation.type === "typing") {
      providerResponse = await requestJson(`${base}/typing`, {
        method: "POST",
        headers,
      });
    } else {
      const messageUrl = `${base}/messages/${encodeURIComponent(operation.providerMessageId)}`;
      if (operation.type === "reaction.add" || operation.type === "reaction.remove") {
        providerResponse = await requestJson(
          `${messageUrl}/reactions/${encodeURIComponent(operation.emoji)}/@me`,
          {
            method: operation.type === "reaction.add" ? "PUT" : "DELETE",
            headers,
          },
        );
      } else if (operation.type === "edit") {
        providerResponse = await requestJson(messageUrl, {
          method: "PATCH",
          headers,
          body: {
            content: operationTextWithinLimit(
              operation,
              getImOutboundLimits("discord").maxTextCharacters ?? 2000,
              "discord_edit_text_too_long",
            ),
          },
        });
      } else {
        providerResponse = await requestJson(messageUrl, {
          method: "DELETE",
          headers,
        });
      }
    }
  } else if (operation.channelType === "feishu") {
    const token = await resolveFeishuToken(connection);
    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(operation.providerMessageId ?? "")}`;
    const headers = { Authorization: `Bearer ${token}` };
    if (operation.type === "reaction.add") {
      providerResponse = await requestJson(`${url}/reactions`, {
        method: "POST",
        headers,
        body: {
          reaction_type: { emoji_type: feishuEmojiType(operation.emoji) },
        },
      });
    } else if (operation.type === "reaction.remove") {
      providerResponse = await removeFeishuReaction(url, feishuEmojiType(operation.emoji), headers);
    } else if (operation.type === "edit") {
      providerResponse = await requestJson(url, {
        method: "PATCH",
        headers,
        body: {
          content: JSON.stringify({
            text: operationTextWithinLimit(
              operation,
              getImOutboundLimits("feishu").maxTextCharacters ?? 4000,
              "feishu_edit_text_too_long",
            ),
          }),
        },
      });
    } else if (operation.type === "delete") {
      providerResponse = await requestJson(url, {
        method: "DELETE",
        headers,
      });
    } else {
      throw new ChannelProviderHttpError(
        422,
        `feishu_${operation.type.replace(".", "_")}_not_supported`,
      );
    }
    assertFeishuOk(providerResponse, `feishu_${operation.type}_failed`);
  } else if (operation.channelType === "dingtalk") {
    if (operation.type !== "delete") {
      throw new ChannelProviderHttpError(422, `dingtalk_${operation.type}_not_supported`);
    }
    if (operation.providerMessageId.startsWith("dingtalk:ack:")) {
      throw new ChannelProviderHttpError(422, "dingtalk_process_query_key_required");
    }
    const accessToken = await resolveDingTalkToken(connection);
    const robotCode =
      channelAttribute(operation, "robotCode") ?? credential(connection, "robotCode");
    const conversationType = channelAttribute(operation, "conversationType");
    const isDirectConversation = conversationType === "1";
    const url = isDirectConversation
      ? "https://api.dingtalk.com/v1.0/robot/otoMessages/batchRecall"
      : "https://api.dingtalk.com/v1.0/robot/groupMessages/recall";
    providerResponse = await postJson(
      url,
      isDirectConversation
        ? {
            robotCode,
            processQueryKeys: [operation.providerMessageId],
          }
        : {
            robotCode,
            openConversationId: operation.externalThreadId,
            processQueryKeys: [operation.providerMessageId],
          },
      { "x-acs-dingtalk-access-token": accessToken },
    );
    assertDingTalkRecallOk(providerResponse, operation.providerMessageId);
  } else if (operation.channelType === "whatsapp") {
    if (
      operation.type !== "typing" &&
      operation.type !== "reaction.add" &&
      operation.type !== "reaction.remove"
    ) {
      throw new ChannelProviderHttpError(422, `whatsapp_${operation.type}_not_supported`);
    }
    const token = credential(connection, "accessToken");
    const phoneNumberId = credential(connection, "phoneNumberId");
    const version = optionalCredential(connection, "graphApiVersion") ?? "v20.0";
    if (operation.type === "typing" && !operation.providerMessageId) {
      throw new ChannelProviderHttpError(422, "whatsapp_typing_message_required");
    }
    providerResponse = await postJson(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      operation.type === "typing"
        ? {
            messaging_product: "whatsapp",
            status: "read",
            message_id: operation.providerMessageId,
            typing_indicator: { type: "text" },
          }
        : {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: operation.externalThreadId,
            type: "reaction",
            reaction: {
              message_id: operation.providerMessageId,
              emoji: operation.type === "reaction.add" ? operation.emoji : "",
            },
          },
      { Authorization: `Bearer ${token}` },
    );
  } else if (operation.channelType === "wecom") {
    if (operation.type !== "delete") {
      throw new ChannelProviderHttpError(422, `wecom_${operation.type}_not_supported`);
    }
    const accessToken = await resolveWeComToken(connection);
    providerResponse = await postJson(
      `https://qyapi.weixin.qq.com/cgi-bin/message/recall?access_token=${encodeURIComponent(accessToken)}`,
      { msgid: operation.providerMessageId },
    );
    assertWeComOk(providerResponse, "wecom_message_recall_failed");
  } else {
    throw new ChannelProviderHttpError(
      422,
      `${operation.channelType}_${operation.type}_not_supported`,
    );
  }
  return { completedAt: new Date(), providerResponse };
}

async function executeImAction(
  action: ImOutboundAction,
  connection: ChannelConnectionConfig,
): Promise<{ providerMessageId?: string; payload: unknown }> {
  if (action.platform === "telegram") {
    const token = credential(connection, "botToken");
    const method = action.method;
    const body: Record<string, unknown> = { chat_id: action.chatId };
    if (action.messageThreadId) body.message_thread_id = action.messageThreadId;
    if (action.businessConnectionId) body.business_connection_id = action.businessConnectionId;
    if (action.replyToMessageId) {
      const messageId = Number(action.replyToMessageId);
      if (Number.isInteger(messageId)) body.reply_parameters = { message_id: messageId };
    }
    if (method === "sendMessage") {
      body.text = action.text;
      if (action.buttons?.length) {
        body.reply_markup = {
          inline_keyboard: chunk(action.buttons.slice(0, 8), 2).map((row) =>
            row.map((button) =>
              button.url
                ? { text: button.label, url: button.url }
                : { text: button.label, callback_data: button.id.slice(0, 64) },
            ),
          ),
        };
      }
    }
    if (method === "sendPhoto")
      Object.assign(body, { photo: action.photoUrl, caption: action.caption });
    if (method === "sendVoice")
      Object.assign(body, { voice: action.voiceUrl, caption: action.caption });
    if (method === "sendVideo")
      Object.assign(body, { video: action.videoUrl, caption: action.caption });
    if (method === "sendDocument") {
      Object.assign(body, {
        document: action.documentUrl,
        caption: action.caption,
      });
    }
    const payload = await postJson(`https://api.telegram.org/bot${token}/${method}`, body);
    assertTelegramOk(payload, `telegram_${method}_failed`);
    return {
      providerMessageId: nestedId(payload, "result", "message_id"),
      payload,
    };
  }

  if (action.platform === "slack") {
    const token = credential(connection, "botToken");
    if (action.method === "files.uploadV2") {
      const file = await fetchRemoteFile(action.fileUrl);
      const ticket = await postForm(
        "https://slack.com/api/files.getUploadURLExternal",
        { filename: action.fileName, length: String(file.bytes.byteLength) },
        { Authorization: `Bearer ${token}` },
      );
      assertProviderOk(ticket, "slack_upload_ticket_failed");
      const uploadUrl = isRecord(ticket) ? ticket.upload_url : undefined;
      const fileId = isRecord(ticket) ? ticket.file_id : undefined;
      if (typeof uploadUrl !== "string" || typeof fileId !== "string") {
        throw new ChannelProviderHttpError(502, "slack_upload_ticket_invalid");
      }
      await uploadRawFile(uploadUrl, file.bytes, action.contentType);
      const payload = await postJson(
        "https://slack.com/api/files.completeUploadExternal",
        {
          files: [{ id: fileId, title: action.title ?? action.fileName }],
          channel_id: action.channel,
          thread_ts: action.threadTs,
        },
        { Authorization: `Bearer ${token}` },
      );
      assertProviderOk(payload, "slack_upload_complete_failed");
      return { providerMessageId: fileId, payload };
    }
    const payload = await postJson(
      "https://slack.com/api/chat.postMessage",
      {
        channel: action.channel,
        text: action.text,
        thread_ts: action.threadTs,
        blocks: action.buttons?.length
          ? [
              { type: "section", text: { type: "mrkdwn", text: action.text } },
              ...chunk(action.buttons.slice(0, 8), 5).map((buttons) => ({
                type: "actions",
                elements: buttons.map((button) => ({
                  type: "button",
                  text: { type: "plain_text", text: button.label.slice(0, 75) },
                  action_id: button.id.slice(0, 255),
                  value: button.id.slice(0, 2000),
                  ...(button.url ? { url: button.url } : {}),
                })),
              })),
            ]
          : undefined,
      },
      { Authorization: `Bearer ${token}` },
    );
    assertProviderOk(payload, "slack_message_send_failed");
    return { providerMessageId: fieldId(payload, "ts"), payload };
  }

  if (action.platform === "discord") {
    const token = credential(connection, "botToken");
    const url = `https://discord.com/api/v10/channels/${encodeURIComponent(action.channelId)}/messages`;
    const payload =
      action.method === "createMessage"
        ? await postJson(
            url,
            {
              content: action.content,
              message_reference: action.replyToMessageId
                ? { message_id: action.replyToMessageId }
                : undefined,
              components: discordComponents(action.buttons),
            },
            { Authorization: `Bot ${token}` },
          )
        : await sendDiscordFile(url, action, token);
    return { providerMessageId: fieldId(payload, "id"), payload };
  }

  if (action.platform === "feishu") {
    const token = await resolveFeishuToken(connection);
    if (action.method === "im.media.uploadAndSend") {
      const file = await fetchRemoteFile(action.fileUrl);
      const form = new FormData();
      const uploadUrl =
        action.mediaType === "image"
          ? "https://open.feishu.cn/open-apis/im/v1/images"
          : "https://open.feishu.cn/open-apis/im/v1/files";
      if (action.mediaType === "image") {
        form.set("image_type", "message");
        form.set(
          "image",
          new Blob([toArrayBuffer(file.bytes)], { type: action.contentType }),
          action.fileName,
        );
      } else {
        form.set("file_type", feishuFileType(action.contentType));
        form.set("file_name", action.fileName);
        form.set(
          "file",
          new Blob([toArrayBuffer(file.bytes)], { type: action.contentType }),
          action.fileName,
        );
      }
      const uploaded = await postMultipart(uploadUrl, form, {
        Authorization: `Bearer ${token}`,
      });
      assertFeishuOk(uploaded, "feishu_media_upload_failed");
      const mediaKey = nestedId(
        uploaded,
        "data",
        action.mediaType === "image" ? "image_key" : "file_key",
      );
      if (!mediaKey) throw new ChannelProviderHttpError(502, "feishu_media_key_missing");
      const payload = await postJson(
        feishuSendUrl(action),
        {
          ...(action.replyToMessageId ? {} : { receive_id: action.receiveId }),
          msg_type: action.mediaType,
          content: JSON.stringify({
            [action.mediaType === "image" ? "image_key" : "file_key"]: mediaKey,
          }),
        },
        { Authorization: `Bearer ${token}` },
      );
      assertFeishuOk(payload, "feishu_media_send_failed");
      return {
        providerMessageId: nestedId(payload, "data", "message_id"),
        payload,
      };
    }
    const payload = await postJson(
      feishuSendUrl(action),
      action.buttons?.length
        ? {
            ...(action.replyToMessageId ? {} : { receive_id: action.receiveId }),
            msg_type: "interactive",
            content: JSON.stringify(feishuInteractiveCard(action.text, action.buttons)),
          }
        : {
            ...(action.replyToMessageId ? {} : { receive_id: action.receiveId }),
            msg_type: "text",
            content: JSON.stringify({ text: action.text }),
          },
      { Authorization: `Bearer ${token}` },
    );
    assertFeishuOk(payload, "feishu_message_send_failed");
    return {
      providerMessageId: nestedId(payload, "data", "message_id"),
      payload,
    };
  }

  if (action.platform === "dingtalk") {
    if (
      action.method === "robot.groupMessages.send" ||
      action.method === "robot.oToMessages.batchSend"
    ) {
      const accessToken = await resolveDingTalkToken(connection);
      const payload = await postJson(
        action.method === "robot.groupMessages.send"
          ? "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
          : "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend",
        action.method === "robot.groupMessages.send"
          ? {
              msgKey: action.msgKey,
              msgParam: action.msgParam,
              robotCode: action.robotCode,
              openConversationId: action.openConversationId,
            }
          : {
              msgKey: action.msgKey,
              msgParam: action.msgParam,
              robotCode: action.robotCode,
              userIds: action.userIds,
            },
        { "x-acs-dingtalk-access-token": accessToken },
      );
      const processQueryKey = assertDingTalkSendOk(
        payload,
        action.method === "robot.oToMessages.batchSend" ? action.userIds : undefined,
      );
      return { providerMessageId: processQueryKey, payload };
    }
    if (
      action.method === "sessionWebhook.actionCard" &&
      action.buttons.some((button) => !button.url && !button.callbackUrl)
    ) {
      throw new ChannelProviderHttpError(422, "dingtalk_button_url_required");
    }
    const payload = await postJson(
      action.sessionWebhook,
      action.method === "sessionWebhook.send"
        ? { msgtype: "text", text: { content: action.text } }
        : action.method === "sessionWebhook.markdown"
          ? {
              msgtype: "markdown",
              markdown: { title: action.title, text: action.text },
            }
          : {
              msgtype: "actionCard",
              actionCard: {
                title: action.title,
                text: action.text,
                btnOrientation: "0",
                btns: action.buttons.slice(0, 5).map((button) => ({
                  title: button.label,
                  actionURL: button.url ?? button.callbackUrl,
                })),
              },
            },
    );
    assertDingTalkOk(payload, "dingtalk_message_send_failed");
    return { providerMessageId: fieldId(payload, "processQueryKey"), payload };
  }

  if (action.platform === "whatsapp") {
    const token = credential(connection, "accessToken");
    const phoneNumberId = credential(connection, "phoneNumberId");
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: action.to,
    };
    if (action.replyToMessageId) body.context = { message_id: action.replyToMessageId };
    if (action.method === "messages.template") {
      Object.assign(body, {
        type: "template",
        template: {
          name: action.templateName,
          language: { code: action.languageCode },
          components: action.components,
        },
      });
    } else if (action.method === "messages.text") {
      if (action.buttons?.length) {
        const buttons = action.buttons.slice(0, 10);
        Object.assign(
          body,
          buttons.length <= 3
            ? {
                type: "interactive",
                interactive: {
                  type: "button",
                  body: { text: action.text.slice(0, 1024) },
                  action: {
                    buttons: buttons.map((button) => ({
                      type: "reply",
                      reply: {
                        id: button.id.slice(0, 256),
                        title: button.label.slice(0, 20),
                      },
                    })),
                  },
                },
              }
            : {
                type: "interactive",
                interactive: {
                  type: "list",
                  body: { text: action.text.slice(0, 1024) },
                  action: {
                    button: "Choose an option",
                    sections: [
                      {
                        title: "Options",
                        rows: buttons.map((button) => ({
                          id: button.id.slice(0, 200),
                          title: button.label.slice(0, 24),
                        })),
                      },
                    ],
                  },
                },
              },
        );
      } else {
        Object.assign(body, { type: "text", text: { body: action.text } });
      }
    } else if (action.method === "messages.image") {
      Object.assign(body, {
        type: "image",
        image: { link: action.imageUrl, caption: action.caption },
      });
    } else if (action.method === "messages.audio") {
      Object.assign(body, { type: "audio", audio: { link: action.audioUrl } });
    } else if (action.method === "messages.video") {
      Object.assign(body, {
        type: "video",
        video: { link: action.videoUrl, caption: action.caption },
      });
    } else {
      Object.assign(body, {
        type: "document",
        document: {
          link: action.documentUrl,
          filename: action.fileName,
          caption: action.caption,
        },
      });
    }
    const version = optionalCredential(connection, "graphApiVersion") ?? "v20.0";
    const payload = await postJson(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      body,
      { Authorization: `Bearer ${token}` },
    );
    return { providerMessageId: firstArrayId(payload, "messages"), payload };
  }

  if (action.platform === "wechat") {
    const accessToken = await getWeChatAccessToken(connection.credentials, connection.connectionId);
    const sendUrl = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(accessToken)}`;
    if (action.method === "media.uploadAndSend") {
      const file = await fetchRemoteFile(action.fileUrl);
      const form = new FormData();
      form.set(
        "media",
        new Blob([toArrayBuffer(file.bytes)], { type: action.contentType }),
        action.fileName,
      );
      const uploaded = await postMultipart(
        `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${action.mediaType}`,
        form,
      );
      assertWeChatOk(uploaded, "wechat_media_upload_failed");
      const mediaId = fieldId(uploaded, "media_id");
      if (!mediaId) throw new ChannelProviderHttpError(502, "wechat_media_id_missing");
      const mediaBody: Record<string, unknown> = { media_id: mediaId };
      if (action.mediaType === "video") {
        mediaBody.title = action.title ?? action.fileName;
        mediaBody.description = action.description ?? "";
      }
      const payload = await postJson(sendUrl, {
        touser: action.toUser,
        msgtype: action.mediaType,
        [action.mediaType]: mediaBody,
      });
      assertWeChatOk(payload, "wechat_media_send_failed");
      return { providerMessageId: fieldId(payload, "msgid"), payload };
    }
    const payload = await postJson(
      sendUrl,
      action.buttons?.length
        ? {
            touser: action.toUser,
            msgtype: "msgmenu",
            msgmenu: {
              head_content: action.text,
              list: action.buttons.slice(0, 10).map((button) =>
                button.url
                  ? { content: button.label.slice(0, 256), url: button.url }
                  : {
                      content: button.label.slice(0, 256),
                      id: button.id.slice(0, 256),
                    },
              ),
              tail_content: "",
            },
          }
        : {
            touser: action.toUser,
            msgtype: "text",
            text: { content: action.text },
          },
    );
    assertWeChatOk(payload, "wechat_message_send_failed");
    return { providerMessageId: fieldId(payload, "msgid"), payload };
  }

  const accessToken = await resolveWeComToken(connection);
  if (action.method === "media.uploadAndSend") {
    const file = await fetchRemoteFile(action.fileUrl);
    const form = new FormData();
    form.set(
      "media",
      new Blob([toArrayBuffer(file.bytes)], { type: action.contentType }),
      action.fileName,
    );
    const uploaded = await postMultipart(
      `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${action.mediaType}`,
      form,
    );
    assertWeComOk(uploaded, "wecom_media_upload_failed");
    const mediaId = fieldId(uploaded, "media_id");
    if (!mediaId) throw new ChannelProviderHttpError(502, "wecom_media_id_missing");
    const mediaBody: Record<string, unknown> = { media_id: mediaId };
    const payload = await postJson(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`,
      {
        touser: action.toUser,
        msgtype: action.mediaType,
        agentid: action.agentId,
        [action.mediaType]: mediaBody,
        safe: 0,
      },
    );
    assertWeComOk(payload, "wecom_media_send_failed");
    return { providerMessageId: fieldId(payload, "msgid"), payload };
  }
  const payload = await postJson(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`,
    action.buttons?.length
      ? {
          touser: action.toUser,
          msgtype: "template_card",
          agentid: action.agentId,
          template_card: {
            card_type: "button_interaction",
            source: { icon_url: "", desc: "KeenAI" },
            main_title: {
              title: action.text.slice(0, 64),
              desc: action.text.slice(0, 128),
            },
            button_list: action.buttons.slice(0, 6).map((button) => ({
              text: button.label.slice(0, 30),
              key: button.id.slice(0, 128),
            })),
          },
          enable_id_trans: 0,
        }
      : {
          touser: action.toUser,
          msgtype: "text",
          agentid: action.agentId,
          text: { content: action.text },
          safe: 0,
        },
  );
  assertWeComOk(payload, "wecom_message_send_failed");
  return { providerMessageId: fieldId(payload, "msgid"), payload };
}

async function resolveFeishuToken(connection: ChannelConnectionConfig): Promise<string> {
  return getFeishuTenantAccessToken(connection.credentials, connection.connectionId);
}

async function resolveDingTalkToken(connection: ChannelConnectionConfig): Promise<string> {
  return getDingTalkAccessToken(connection.credentials, connection.connectionId);
}

async function resolveWeComToken(connection: ChannelConnectionConfig): Promise<string> {
  return getWeComAccessToken(connection.credentials, connection.connectionId);
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<unknown> {
  return requestJson(url, { method: "POST", headers, body });
}

async function requestJson(
  url: string,
  input: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  const response = await fetch(url, {
    method: input.method,
    headers: {
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...input.headers,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(CHANNEL_PROVIDER_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({ statusText: response.statusText }));
  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    throw new ChannelProviderHttpError(
      response.status,
      `provider_http_${response.status}`,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined,
    );
  }
  return payload;
}

function operationText(operation: Extract<ChannelMessageOperation, { type: "edit" }>): string {
  const text = operation.parts
    .filter(
      (part): part is Extract<(typeof operation.parts)[number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) throw new ChannelProviderHttpError(422, "message_edit_text_required");
  return text;
}

function operationTextWithinLimit(
  operation: Extract<ChannelMessageOperation, { type: "edit" }>,
  maxCharacters: number,
  errorCode: string,
): string {
  const text = operationText(operation);
  if (Array.from(text).length > maxCharacters) {
    throw new ChannelProviderHttpError(422, errorCode);
  }
  return text;
}

function telegramMessageId(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ChannelProviderHttpError(422, "telegram_message_id_invalid");
  }
  return parsed;
}

function slackEmojiName(emoji: string): string {
  const normalized = emoji.trim().replace(/^:+|:+$/g, "");
  if (!normalized) throw new ChannelProviderHttpError(422, "slack_emoji_required");
  return (
    {
      "👍": "+1",
      "❤️": "heart",
      "❤": "heart",
      "🎉": "tada",
      "👀": "eyes",
    }[normalized] ?? normalized
  );
}

function feishuEmojiType(emoji: string): string {
  const normalized = emoji.trim().replace(/^:+|:+$/g, "");
  const mapped = {
    "👍": "THUMBSUP",
    "❤️": "HEART",
    "❤": "HEART",
    "🎉": "PARTY",
    "👀": "EYES",
  }[normalized];
  if (mapped) return mapped;
  if (/^[A-Z][A-Z0-9_+-]{0,63}$/.test(normalized)) return normalized;
  throw new ChannelProviderHttpError(422, "feishu_emoji_not_supported");
}

async function removeFeishuReaction(
  messageUrl: string,
  emojiType: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const listed = await requestJson(
    `${messageUrl}/reactions?reaction_type=${encodeURIComponent(emojiType)}&page_size=50`,
    { method: "GET", headers },
  );
  assertFeishuOk(listed, "feishu_reaction_list_failed");
  const data = isRecord(listed) && isRecord(listed.data) ? listed.data : undefined;
  const items = Array.isArray(data?.items) ? data.items : [];
  const mine = items.find((item) => {
    if (!isRecord(item) || !isRecord(item.operator)) return false;
    return item.operator.operator_type === "app" && typeof item.reaction_id === "string";
  });
  if (!isRecord(mine) || typeof mine.reaction_id !== "string") {
    return { code: 0, msg: "success", data: { removed: false } };
  }
  return requestJson(`${messageUrl}/reactions/${encodeURIComponent(mine.reaction_id)}`, {
    method: "DELETE",
    headers,
  });
}

async function postForm(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(CHANNEL_PROVIDER_REQUEST_TIMEOUT_MS),
  });
  return parseProviderResponse(response);
}

async function postMultipart(
  url: string,
  body: FormData,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(CHANNEL_PROVIDER_MEDIA_TIMEOUT_MS),
  });
  return parseProviderResponse(response);
}

async function parseProviderResponse(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => ({ statusText: response.statusText }));
  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    throw new ChannelProviderHttpError(
      response.status,
      `provider_http_${response.status}`,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined,
    );
  }
  return payload;
}

const CHANNEL_PROVIDER_REQUEST_TIMEOUT_MS = 30_000;
const CHANNEL_PROVIDER_MEDIA_TIMEOUT_MS = 60_000;
const MAX_OUTBOUND_ATTACHMENT_BYTES = 25 * 1024 * 1024;

async function fetchRemoteFile(url: string): Promise<{ bytes: Uint8Array }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ChannelProviderHttpError(400, "attachment_url_invalid");
  }
  let response: Response;
  try {
    response = await fetch(parsed, {
      signal: AbortSignal.timeout(CHANNEL_PROVIDER_MEDIA_TIMEOUT_MS),
    });
  } catch (error) {
    if (isRequestTimeout(error)) {
      throw new ChannelProviderHttpError(503, "attachment_download_timeout");
    }
    throw error;
  }
  if (!response.ok) {
    throw new ChannelProviderHttpError(response.status, "attachment_download_failed");
  }
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_OUTBOUND_ATTACHMENT_BYTES) {
    throw new ChannelProviderHttpError(413, "attachment_too_large");
  }
  const bytes = await readLimitedResponseBytes(response, MAX_OUTBOUND_ATTACHMENT_BYTES);
  return { bytes };
}

async function readLimitedResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("attachment_too_large");
        throw new ChannelProviderHttpError(413, "attachment_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function uploadRawFile(url: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: toArrayBuffer(bytes),
    signal: AbortSignal.timeout(CHANNEL_PROVIDER_MEDIA_TIMEOUT_MS),
  });
  if (!response.ok) throw new ChannelProviderHttpError(response.status, "file_upload_failed");
}

async function sendDiscordFile(
  url: string,
  action: Extract<ImOutboundAction, { platform: "discord"; method: "createMessageWithFile" }>,
  token: string,
): Promise<unknown> {
  const file = await fetchRemoteFile(action.fileUrl);
  const form = new FormData();
  form.set(
    "payload_json",
    JSON.stringify({
      content: action.content,
      attachments: [{ id: 0, filename: action.fileName, description: action.description }],
      message_reference: action.replyToMessageId
        ? { message_id: action.replyToMessageId }
        : undefined,
    }),
  );
  form.set(
    "files[0]",
    new Blob([toArrayBuffer(file.bytes)], { type: action.contentType }),
    action.fileName,
  );
  return postMultipart(url, form, { Authorization: `Bot ${token}` });
}

function feishuSendUrl(action: Extract<ImOutboundAction, { platform: "feishu" }>): string {
  return action.replyToMessageId
    ? `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(action.replyToMessageId)}/reply`
    : `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${action.receiveIdType}`;
}

function feishuInteractiveCard(
  text: string,
  buttons: Array<{ id: string; label: string; url?: string }>,
): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: "markdown", content: text },
      ...chunk(buttons.slice(0, 8), 5).map((buttonGroup) => ({
        tag: "action",
        actions: buttonGroup.map((button) => ({
          tag: "button",
          text: { tag: "plain_text", content: button.label.slice(0, 75) },
          type: "primary",
          ...(button.url ? { url: button.url } : { value: { keenai_button_id: button.id } }),
        })),
      })),
    ],
  };
}

function discordComponents(
  buttons: Array<{ id: string; label: string; url?: string }> | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!buttons?.length) return undefined;
  return chunk(buttons.slice(0, 10), 5).map((row) => ({
    type: 1,
    components: row.map((button) =>
      button.url
        ? {
            type: 2,
            style: 5,
            label: button.label.slice(0, 80),
            url: button.url,
          }
        : {
            type: 2,
            style: 1,
            label: button.label.slice(0, 80),
            custom_id: button.id.slice(0, 100),
          },
    ),
  }));
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function feishuFileType(
  contentType: string,
): "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream" {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("opus") || normalized.includes("ogg")) return "opus";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "application/pdf") return "pdf";
  if (normalized.includes("word")) return "doc";
  if (normalized.includes("excel") || normalized.includes("spreadsheet")) return "xls";
  if (normalized.includes("powerpoint") || normalized.includes("presentation")) return "ppt";
  return "stream";
}

function assertProviderOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload) || payload.ok !== true) {
    throw new ChannelProviderHttpError(
      400,
      isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback,
    );
  }
}

function assertTelegramOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload) || payload.ok !== true) {
    throw new ChannelProviderHttpError(
      400,
      isRecord(payload) && typeof payload.description === "string" ? payload.description : fallback,
    );
  }
}

function assertFeishuOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload) || payload.code !== 0) {
    throw new ChannelProviderHttpError(
      400,
      isRecord(payload) && typeof payload.msg === "string" ? payload.msg : fallback,
    );
  }
}

function assertWeComOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload) || payload.errcode !== 0) {
    throw new ChannelProviderHttpError(
      400,
      isRecord(payload) && typeof payload.errmsg === "string" ? payload.errmsg : fallback,
    );
  }
}

function assertWeChatOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload) || payload.errcode !== 0) {
    throw new ChannelProviderHttpError(
      400,
      isRecord(payload) && typeof payload.errmsg === "string" ? payload.errmsg : fallback,
    );
  }
}

function assertDingTalkOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload) || payload.errcode !== 0) {
    throw new ChannelProviderHttpError(
      400,
      isRecord(payload) && typeof payload.errmsg === "string" ? payload.errmsg : fallback,
    );
  }
}

function assertDingTalkSendOk(payload: unknown, expectedUserIds?: string[]): string {
  if (!isRecord(payload)) {
    throw new ChannelProviderHttpError(400, "dingtalk_message_send_failed");
  }
  if (expectedUserIds?.length) {
    for (const key of ["invalidStaffIdList", "filteredStaffIdList", "flowControlledStaffIdList"]) {
      const rejected = payload[key];
      if (
        Array.isArray(rejected) &&
        rejected.some((value) => expectedUserIds.includes(String(value)))
      ) {
        throw new ChannelProviderHttpError(400, `dingtalk_${key}`);
      }
    }
  }
  const processQueryKey = fieldId(payload, "processQueryKey");
  if (!processQueryKey) {
    throw new ChannelProviderHttpError(502, "dingtalk_process_query_key_missing");
  }
  return processQueryKey;
}

function assertDingTalkRecallOk(payload: unknown, processQueryKey: string): void {
  if (!isRecord(payload)) {
    throw new ChannelProviderHttpError(400, "dingtalk_message_recall_failed");
  }
  const failedResult = payload.failedResult;
  if (isRecord(failedResult) && Object.keys(failedResult).length > 0) {
    const reason = failedResult[processQueryKey];
    throw new ChannelProviderHttpError(
      400,
      typeof reason === "string" && reason.trim() ? reason : "dingtalk_message_recall_failed",
    );
  }
  if (
    !Array.isArray(payload.successResult) ||
    !payload.successResult.some((value) => String(value) === processQueryKey)
  ) {
    throw new ChannelProviderHttpError(400, "dingtalk_message_recall_failed");
  }
}

class ChannelProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ChannelProviderHttpError";
  }
}

class ChannelPartialDeliveryError extends Error {
  readonly partialDelivery = true;
  readonly providerResponse: Record<string, unknown>;

  constructor(
    failedActionIndex: number,
    providerMessageIds: string[],
    providerMessageRefs: ChannelProviderMessageRef[],
    responses: unknown[],
    cause: unknown,
  ) {
    super(
      `channel_partial_delivery_after_${failedActionIndex}_actions: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ChannelPartialDeliveryError";
    this.providerResponse = {
      partialDelivery: true,
      failedActionIndex,
      completedActionCount: responses.length,
      providerMessageIds: [...providerMessageIds],
      providerMessageRefs: [...providerMessageRefs],
      responses: [...responses],
    };
  }
}

function isRequestTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function credential(connection: ChannelConnectionConfig, key: string): string {
  const value = optionalCredential(connection, key);
  if (!value) throw new ChannelProviderHttpError(400, `${connection.channelType}_${key}_required`);
  return value;
}

function optionalCredential(connection: ChannelConnectionConfig, key: string): string | undefined {
  const value = connection.credentials[key] ?? connection.settings[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function channelAttribute(operation: ChannelMessageOperation, key: string): string | undefined {
  const value = operation.channelAttributes?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fieldId(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const result = value[key];
  return typeof result === "string" || typeof result === "number" ? String(result) : undefined;
}

function nestedId(value: unknown, parent: string, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  return fieldId(value[parent], key);
}

function firstArrayId(value: unknown, key: string): string | undefined {
  if (!isRecord(value) || !Array.isArray(value[key])) return undefined;
  return fieldId(value[key][0], "id");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
