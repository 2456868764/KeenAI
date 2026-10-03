#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export const SUPPORTED_CHANNELS = [
  "widget",
  "email",
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "wechat",
  "wecom",
  "feishu",
  "dingtalk",
];

const PROVIDER_VERIFICATIONS = new Set(["provider"]);
const LOCAL_VERIFICATIONS = new Set(["local"]);
const TERMINAL_DELIVERY_STATUSES = new Set(["sent", "delivered", "read"]);
const RECEIPT_DELIVERY_STATUSES = new Set(["delivered", "read"]);

export function acceptanceConfig(env = process.env) {
  const channels = csv(env.KEENAI_ACCEPTANCE_CHANNELS ?? SUPPORTED_CHANNELS.join(","));
  const unknown = channels.filter((channel) => !SUPPORTED_CHANNELS.includes(channel));
  if (unknown.length > 0) throw new Error(`unsupported_channels:${unknown.join(",")}`);

  const mode = env.KEENAI_ACCEPTANCE_MODE ?? "connections";
  if (mode !== "connections" && mode !== "roundtrip" && mode !== "full") {
    throw new Error("KEENAI_ACCEPTANCE_MODE must be connections, roundtrip, or full");
  }

  const probes = parseJsonObject(env.KEENAI_ACCEPTANCE_PROBES_JSON, "probes");
  if (mode === "roundtrip" || mode === "full") {
    const missing = channels.filter((channel) => !probes[channel]);
    if (missing.length > 0) throw new Error(`missing_roundtrip_probes:${missing.join(",")}`);
  }

  return {
    apiUrl: stripTrailingSlash(env.KEENAI_API_URL ?? "http://127.0.0.1:8090"),
    accessToken: env.KEENAI_ACCESS_TOKEN,
    email: env.KEENAI_ACCEPTANCE_EMAIL,
    password: env.KEENAI_ACCEPTANCE_PASSWORD,
    orgSlug: env.KEENAI_ACCEPTANCE_ORG_SLUG,
    brandId: env.KEENAI_ACCEPTANCE_BRAND_ID,
    channels,
    mode,
    probes,
    timeoutMs: positiveInteger(env.KEENAI_ACCEPTANCE_TIMEOUT_MS, 60_000),
    pollIntervalMs: positiveInteger(env.KEENAI_ACCEPTANCE_POLL_INTERVAL_MS, 2_000),
    requestTimeoutMs: positiveInteger(env.KEENAI_ACCEPTANCE_REQUEST_TIMEOUT_MS, 15_000),
    inboundMaxAgeMinutes: positiveInteger(env.KEENAI_ACCEPTANCE_INBOUND_MAX_AGE_MINUTES, 60),
    allowConfigurationOnly: csv(env.KEENAI_ACCEPTANCE_ALLOW_CONFIGURATION_ONLY ?? ""),
    reportPath: env.KEENAI_ACCEPTANCE_REPORT,
  };
}

export async function runChannelProviderAcceptance(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const readFileImpl = dependencies.readFileImpl ?? readFile;
  const startedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt: null,
    mode: config.mode,
    apiUrl: config.apiUrl,
    brandId: null,
    passed: false,
    channels: [],
  };

  try {
    const auth = await authenticate(config, fetchImpl);
    const brandId = config.brandId ?? auth.brandIds?.[0];
    if (!brandId) throw new Error("acceptance_brand_id_required");
    report.brandId = brandId;

    const connectionResponse = await apiRequest(config, fetchImpl, auth.accessToken, {
      path: `/api/v1/dashboard/channel-connections?brandId=${encodeURIComponent(brandId)}`,
    });
    const connections = Array.isArray(connectionResponse.items) ? connectionResponse.items : [];

    for (const channel of config.channels) {
      const result = await verifyChannel({
        channel,
        connections,
        config,
        token: auth.accessToken,
        fetchImpl,
        sleep,
        readFileImpl,
      });
      report.channels.push(result);
    }
    report.passed = report.channels.every((channel) => channel.passed);
  } catch (error) {
    report.error = safeError(error);
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

async function verifyChannel(input) {
  const channelConnections = input.connections.filter(
    (connection) => connection.channelType === input.channel && connection.status === "active",
  );
  const result = {
    channel: input.channel,
    passed: false,
    connections: [],
    roundtrip: null,
  };

  if (channelConnections.length === 0) {
    result.error = "active_connection_missing";
    return result;
  }

  for (const connection of channelConnections) {
    try {
      const response = await apiRequest(input.config, input.fetchImpl, input.token, {
        method: "POST",
        path: `/api/v1/dashboard/channel-connections/${encodeURIComponent(connection.id)}/test`,
      });
      const verification = response.result?.verification;
      const expected = input.channel === "widget" ? LOCAL_VERIFICATIONS : PROVIDER_VERIFICATIONS;
      const configurationOnlyAllowed =
        verification === "configuration_only" &&
        input.config.allowConfigurationOnly.includes(input.channel);
      const passed = expected.has(verification) || configurationOnlyAllowed;
      result.connections.push({
        id: connection.id,
        name: connection.name,
        transport: connection.transport,
        verification,
        passed,
        ...(passed ? {} : { error: `unexpected_verification:${verification ?? "missing"}` }),
      });
    } catch (error) {
      result.connections.push({
        id: connection.id,
        name: connection.name,
        transport: connection.transport,
        passed: false,
        error: safeError(error),
      });
    }
  }

  if (input.config.mode === "roundtrip" || input.config.mode === "full") {
    try {
      result.roundtrip = await verifyRoundtrip(input);
    } catch (error) {
      result.roundtrip = { passed: false, error: safeError(error) };
    }
  }

  result.passed =
    result.connections.every((connection) => connection.passed) &&
    (input.config.mode === "connections" || result.roundtrip?.passed === true);
  return result;
}

async function verifyRoundtrip(input) {
  const roundtripStartedAt = Date.now();
  const probe = input.config.probes[input.channel];
  validateProbe(input.channel, probe);

  const conversationResponse = await apiRequest(input.config, input.fetchImpl, input.token, {
    path: `/api/v1/dashboard/conversations/${encodeURIComponent(probe.conversationId)}`,
  });
  const conversation = conversationResponse.conversation;
  if (conversation?.channelType !== input.channel) {
    throw new Error(`conversation_channel_mismatch:${conversation?.channelType ?? "missing"}`);
  }
  const capabilities = new Set(
    Array.isArray(conversation.channelCapabilities) ? conversation.channelCapabilities : [],
  );
  if (input.config.mode === "full") validateCapabilityProbe(input.channel, probe, capabilities);

  const inbound = await waitForMessage({
    config: input.config,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    token: input.token,
    conversationId: probe.conversationId,
    predicate: (message) =>
      message.senderType === "user" &&
      !message.deletedAt &&
      message.plainText?.includes(probe.inboundToken) &&
      (input.config.mode !== "full" ||
        !capabilities.has("attachments") ||
        messageHasAttachment(message, probe.inboundAttachmentFileName)) &&
      isRecent(message.createdAt, input.config.inboundMaxAgeMinutes),
    timeoutError: "inbound_probe_not_observed",
  });

  const featureResults = [];
  let attachmentId;
  if (input.config.mode === "full" && capabilities.has("attachments")) {
    attachmentId = await uploadAcceptanceAttachment(input, probe);
    featureResults.push({ feature: "attachments", passed: true });
  }

  if (input.config.mode === "full" && capabilities.has("typing")) {
    await apiRequest(input.config, input.fetchImpl, input.token, {
      method: "POST",
      path: `/api/v1/dashboard/conversations/${encodeURIComponent(probe.conversationId)}/typing`,
    });
    featureResults.push({ feature: "typing", passed: true });
  }

  const outboundText =
    probe.outboundText ?? `KeenAI channel acceptance ${input.channel} ${new Date().toISOString()}`;
  const outboundRequestedAt = Date.now();
  const sent = await apiRequest(input.config, input.fetchImpl, input.token, {
    method: "POST",
    path: `/api/v1/dashboard/conversations/${encodeURIComponent(probe.conversationId)}/messages`,
    body: {
      plainText: outboundText,
      isInternal: false,
      ...(attachmentId ? { attachmentIds: [attachmentId] } : {}),
      ...(capabilities.has("threads") ? { inReplyTo: inbound.id } : {}),
    },
  });
  const messageId = sent.message?.id;
  if (!messageId) throw new Error("outbound_message_id_missing");

  let outbound = await waitForMessage({
    config: input.config,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    token: input.token,
    conversationId: probe.conversationId,
    predicate: (message) =>
      message.id === messageId && TERMINAL_DELIVERY_STATUSES.has(message.deliveryStatus),
    timeoutError: "outbound_delivery_not_confirmed",
  });

  const outboundAck = await waitForMessage({
    config: input.config,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    token: input.token,
    conversationId: probe.conversationId,
    predicate: (message) =>
      message.senderType === "user" &&
      message.id !== inbound.id &&
      !message.deletedAt &&
      message.plainText?.includes(probe.outboundAckToken) &&
      isAtOrAfter(message.createdAt, outboundRequestedAt),
    timeoutError: "outbound_ack_probe_not_observed",
  });

  if (input.config.mode === "full") {
    if (capabilities.has("threads")) featureResults.push({ feature: "threads", passed: true });
    if (capabilities.has("delivery_receipts")) {
      outbound = await waitForMessage({
        config: input.config,
        fetchImpl: input.fetchImpl,
        sleep: input.sleep,
        token: input.token,
        conversationId: probe.conversationId,
        predicate: (message) =>
          message.id === messageId && RECEIPT_DELIVERY_STATUSES.has(message.deliveryStatus),
        timeoutError: "delivery_receipt_not_observed",
      });
      featureResults.push({ feature: "delivery_receipts", passed: true });
    }
    if (capabilities.has("read_receipts")) {
      outbound = await waitForMessage({
        config: input.config,
        fetchImpl: input.fetchImpl,
        sleep: input.sleep,
        token: input.token,
        conversationId: probe.conversationId,
        predicate: (message) => message.id === messageId && message.deliveryStatus === "read",
        timeoutError: "read_receipt_not_observed",
      });
      featureResults.push({ feature: "read_receipts", passed: true });
    }
    if (capabilities.has("interactive")) {
      await verifyInteractiveCapability({ ...input, probe, roundtripStartedAt });
      featureResults.push({ feature: "interactive", passed: true });
    }
    if (capabilities.has("templates")) {
      await verifyTemplateCapability({ ...input, probe });
      featureResults.push({ feature: "templates", passed: true });
    }
    await verifyMutableCapabilities({
      ...input,
      probe,
      capabilities,
      messageId,
      featureResults,
    });
    for (const feature of [
      "attachments",
      "threads",
      "typing",
      "interactive",
      "templates",
      "delivery_receipts",
      "read_receipts",
      "message_edit",
      "reactions",
      "message_delete",
    ]) {
      if (!featureResults.some((result) => result.feature === feature)) {
        featureResults.push({ feature, passed: true, skipped: true, reason: "not_declared" });
      }
    }
  }

  return {
    passed: true,
    conversationId: probe.conversationId,
    inboundMessageId: inbound.id,
    outboundMessageId: outbound.id,
    outboundAckMessageId: outboundAck.id,
    deliveryStatus: outbound.deliveryStatus,
    capabilities: [...capabilities],
    features: featureResults,
  };
}

async function verifyInteractiveCapability(input) {
  const prompt = await waitForMessage({
    config: input.config,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    token: input.token,
    conversationId: input.probe.conversationId,
    predicate: (message) =>
      message.senderType === "agent" &&
      !message.deletedAt &&
      message.plainText?.includes(input.probe.interactivePromptToken) &&
      workflowButtonIds(message.content).has(input.probe.interactiveButtonId) &&
      isRecent(message.createdAt, input.config.inboundMaxAgeMinutes),
    timeoutError: "interactive_prompt_not_observed",
  });
  const promptCreatedAt = Date.parse(prompt.createdAt);
  const completionNotBefore = Math.max(
    input.roundtripStartedAt,
    Number.isFinite(promptCreatedAt) ? promptCreatedAt : input.roundtripStartedAt,
  );
  await waitForMessage({
    config: input.config,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    token: input.token,
    conversationId: input.probe.conversationId,
    predicate: (message) =>
      message.senderType === "agent" &&
      !message.deletedAt &&
      message.plainText?.includes(input.probe.interactiveCompletionToken) &&
      isAtOrAfter(message.createdAt, completionNotBefore) &&
      isRecent(message.createdAt, input.config.inboundMaxAgeMinutes),
    timeoutError: "interactive_callback_not_observed",
  });
}

async function verifyTemplateCapability(input) {
  const sent = await apiRequest(input.config, input.fetchImpl, input.token, {
    method: "POST",
    path: `/api/v1/dashboard/conversations/${encodeURIComponent(input.probe.conversationId)}/messages`,
    body: {
      directives: {
        whatsappTemplate: {
          name: input.probe.templateName,
          languageCode: input.probe.templateLanguageCode,
          ...(input.probe.templateComponents ? { components: input.probe.templateComponents } : {}),
        },
      },
    },
  });
  const messageId = sent.message?.id;
  if (!messageId) throw new Error("template_message_id_missing");
  await waitForMessage({
    config: input.config,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    token: input.token,
    conversationId: input.probe.conversationId,
    predicate: (message) =>
      message.id === messageId && TERMINAL_DELIVERY_STATUSES.has(message.deliveryStatus),
    timeoutError: "template_delivery_not_confirmed",
  });
}

async function verifyMutableCapabilities(input) {
  const conversationPath = `/api/v1/dashboard/conversations/${encodeURIComponent(input.probe.conversationId)}`;
  const messagePath = `${conversationPath}/messages/${encodeURIComponent(input.messageId)}`;

  if (input.capabilities.has("message_edit")) {
    const editedText =
      input.probe.editedText ??
      `KeenAI edited acceptance ${input.channel} ${new Date().toISOString()}`;
    await apiRequest(input.config, input.fetchImpl, input.token, {
      method: "PATCH",
      path: messagePath,
      headers: { "Idempotency-Key": featureKey(input, "edit") },
      body: { plainText: editedText },
    });
    await waitForMessage({
      config: input.config,
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      token: input.token,
      conversationId: input.probe.conversationId,
      predicate: (message) =>
        message.id === input.messageId &&
        message.plainText === editedText &&
        Boolean(message.editedAt),
      timeoutError: "message_edit_not_confirmed",
    });
    input.featureResults.push({ feature: "message_edit", passed: true });
  }

  if (input.capabilities.has("reactions")) {
    const emoji = input.probe.reactionEmoji ?? "👍";
    await apiRequest(input.config, input.fetchImpl, input.token, {
      method: "PUT",
      path: `${messagePath}/reactions`,
      headers: { "Idempotency-Key": featureKey(input, "reaction-add") },
      body: { emoji },
    });
    await waitForMessage({
      config: input.config,
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      token: input.token,
      conversationId: input.probe.conversationId,
      predicate: (message) =>
        message.id === input.messageId &&
        Array.isArray(message.reactions) &&
        message.reactions.some((reaction) => reaction?.emoji === emoji),
      timeoutError: "reaction_add_not_confirmed",
    });
    await apiRequest(input.config, input.fetchImpl, input.token, {
      method: "DELETE",
      path: `${messagePath}/reactions`,
      headers: { "Idempotency-Key": featureKey(input, "reaction-remove") },
      body: { emoji },
    });
    await waitForMessage({
      config: input.config,
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      token: input.token,
      conversationId: input.probe.conversationId,
      predicate: (message) =>
        message.id === input.messageId &&
        (!Array.isArray(message.reactions) ||
          !message.reactions.some((reaction) => reaction?.emoji === emoji)),
      timeoutError: "reaction_remove_not_confirmed",
    });
    input.featureResults.push({ feature: "reactions", passed: true });
  }

  if (input.capabilities.has("message_delete")) {
    await apiRequest(input.config, input.fetchImpl, input.token, {
      method: "DELETE",
      path: messagePath,
      headers: { "Idempotency-Key": featureKey(input, "delete") },
    });
    await waitForMessage({
      config: input.config,
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      token: input.token,
      conversationId: input.probe.conversationId,
      predicate: (message) => message.id === input.messageId && Boolean(message.deletedAt),
      timeoutError: "message_delete_not_confirmed",
    });
    input.featureResults.push({ feature: "message_delete", passed: true });
  }
}

async function uploadAcceptanceAttachment(input, probe) {
  const bytes = await input.readFileImpl(probe.attachmentPath);
  if (!bytes?.byteLength) throw new Error(`attachment_file_empty:${input.channel}`);
  const fileName = probe.attachmentFileName ?? basename(probe.attachmentPath);
  const contentType = probe.attachmentContentType;
  const presigned = await apiRequest(input.config, input.fetchImpl, input.token, {
    method: "POST",
    path: "/api/v1/dashboard/uploads/presign",
    body: { fileName, contentType, sizeBytes: bytes.byteLength, purpose: "message_attachment" },
  });
  if (typeof presigned.uploadUrl !== "string") throw new Error("attachment_upload_url_missing");
  const uploaded = await rawRequest(input.config, input.fetchImpl, input.token, {
    method: "PUT",
    url: presigned.uploadUrl,
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (typeof uploaded.attachmentId !== "string") throw new Error("attachment_id_missing");
  return uploaded.attachmentId;
}

function featureKey(input, feature) {
  return `acceptance:${input.channel}:${input.messageId}:${feature}`;
}

async function waitForMessage(input) {
  const deadline = Date.now() + input.config.timeoutMs;
  while (Date.now() <= deadline) {
    const response = await apiRequest(input.config, input.fetchImpl, input.token, {
      path: `/api/v1/dashboard/conversations/${encodeURIComponent(input.conversationId)}/messages?limit=100`,
    });
    const found = Array.isArray(response.items) ? response.items.find(input.predicate) : undefined;
    if (found) return found;
    await input.sleep(input.config.pollIntervalMs);
  }
  throw new Error(input.timeoutError);
}

async function authenticate(config, fetchImpl) {
  if (config.accessToken) {
    const me = await apiRequest(config, fetchImpl, config.accessToken, {
      path: "/api/v1/dashboard/me",
    });
    return { accessToken: config.accessToken, brandIds: me.brandIds };
  }
  if (!config.email || !config.password || !config.orgSlug) {
    throw new Error("acceptance_auth_required");
  }
  return apiRequest(config, fetchImpl, null, {
    method: "POST",
    path: "/api/v1/dashboard/auth/login",
    body: { email: config.email, password: config.password, orgSlug: config.orgSlug },
  });
}

async function apiRequest(config, fetchImpl, token, request) {
  return rawRequest(config, fetchImpl, token, {
    ...request,
    url: `${config.apiUrl}${request.path}`,
  });
}

async function rawRequest(config, fetchImpl, token, request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: request.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(request.body && isJsonRequestBody(request.body)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...request.headers,
      },
      body:
        request.body === undefined
          ? undefined
          : isJsonRequestBody(request.body)
            ? JSON.stringify(request.body)
            : request.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`api_invalid_json:${response.status}`);
      }
    }
    if (!response.ok) {
      const code = payload.error ?? payload.message ?? `http_${response.status}`;
      throw new Error(`api_request_failed:${response.status}:${String(code)}`);
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("api_request_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function validateProbe(channel, probe) {
  if (!probe || typeof probe !== "object") throw new Error(`probe_missing:${channel}`);
  if (typeof probe.conversationId !== "string" || !probe.conversationId) {
    throw new Error(`probe_conversation_id_required:${channel}`);
  }
  if (typeof probe.inboundToken !== "string" || !probe.inboundToken) {
    throw new Error(`probe_inbound_token_required:${channel}`);
  }
  if (typeof probe.outboundAckToken !== "string" || !probe.outboundAckToken) {
    throw new Error(`probe_outbound_ack_token_required:${channel}`);
  }
  if (probe.outboundText !== undefined && typeof probe.outboundText !== "string") {
    throw new Error(`probe_outbound_text_invalid:${channel}`);
  }
}

function validateCapabilityProbe(channel, probe, capabilities) {
  if (capabilities.has("attachments")) {
    if (typeof probe.inboundAttachmentFileName !== "string" || !probe.inboundAttachmentFileName) {
      throw new Error(`probe_inbound_attachment_file_name_required:${channel}`);
    }
    if (typeof probe.attachmentPath !== "string" || !probe.attachmentPath) {
      throw new Error(`probe_attachment_path_required:${channel}`);
    }
    if (typeof probe.attachmentContentType !== "string" || !probe.attachmentContentType) {
      throw new Error(`probe_attachment_content_type_required:${channel}`);
    }
  }
  if (capabilities.has("interactive")) {
    for (const field of [
      "interactivePromptToken",
      "interactiveButtonId",
      "interactiveCompletionToken",
    ]) {
      if (typeof probe[field] !== "string" || !probe[field]) {
        throw new Error(`probe_${field}_required:${channel}`);
      }
    }
  }
  if (capabilities.has("templates")) {
    if (typeof probe.templateName !== "string" || !probe.templateName) {
      throw new Error(`probe_template_name_required:${channel}`);
    }
    if (typeof probe.templateLanguageCode !== "string" || !probe.templateLanguageCode) {
      throw new Error(`probe_template_language_code_required:${channel}`);
    }
    if (probe.templateComponents !== undefined && !Array.isArray(probe.templateComponents)) {
      throw new Error(`probe_template_components_invalid:${channel}`);
    }
  }
}

function messageHasAttachment(message, fileName) {
  return (
    Array.isArray(message.attachments) &&
    message.attachments.some(
      (attachment) =>
        attachment && typeof attachment === "object" && attachment.fileName === fileName,
    )
  );
}

function workflowButtonIds(content) {
  if (!content || typeof content !== "object" || content.type !== "workflow_reply_buttons") {
    return new Set();
  }
  const buttons = content.workflow?.buttons;
  if (!Array.isArray(buttons)) return new Set();
  return new Set(
    buttons.flatMap((button) =>
      button && typeof button === "object" && typeof button.id === "string" ? [button.id] : [],
    ),
  );
}

function isJsonRequestBody(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof Blob) &&
    !(value instanceof FormData) &&
    !(value instanceof URLSearchParams)
  );
}

function isRecent(value, maxAgeMinutes) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= Date.now() - maxAgeMinutes * 60_000;
}

function isAtOrAfter(value, minimumTimestamp) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= minimumTimestamp;
}

function csv(value) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseJsonObject(value, label) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`invalid_${label}_json`);
  }
}

function positiveInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`invalid_positive_integer:${value}`);
  return parsed;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function safeError(error) {
  return error instanceof Error ? error.message : "unknown_error";
}

async function main() {
  let report;
  let config;
  try {
    config = acceptanceConfig();
    report = await runChannelProviderAcceptance(config);
  } catch (error) {
    report = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      passed: false,
      error: safeError(error),
      channels: [],
    };
  }

  if (config?.reportPath) {
    await writeFile(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
