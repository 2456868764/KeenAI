import {
  type AgentResponseParseResult,
  type OutboundDirectives,
  type OutboundPart,
  outboundPartSchema,
} from "@keenai/shared";

const STORAGE_KEY_RE = /^[a-f0-9]{32}(?:\.[a-zA-Z0-9]{1,32})?$/;
const MEDIA_TAG_RE = /MEDIA:([a-f0-9]{32}(?:\.[a-zA-Z0-9]{1,32})?)/gi;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const URL_RE = /\bhttps?:\/\/[^\s<>)]+/gi;
const LOCAL_UPLOAD_PATH_RE =
  /(?:^|\s)((?:\.\/)?data\/uploads\/[a-f0-9]{32}(?:\.[a-zA-Z0-9]{1,32})?|\/[^\s<>)]+\/data\/uploads\/[a-f0-9]{32}(?:\.[a-zA-Z0-9]{1,32})?)/gi;
const DIRECTIVE_AS_VOICE_RE = /\[\[audio_as_voice\]\]/gi;
const DIRECTIVE_AS_DOCUMENT_RE = /\[\[as_document\]\]/gi;

export function parseAgentResponse(input: string | OutboundPart[]): AgentResponseParseResult {
  if (Array.isArray(input)) {
    return parseStructuredParts(input);
  }
  return parseAgentResponseText(input);
}

function parseStructuredParts(parts: OutboundPart[]): AgentResponseParseResult {
  const validated = parts.map((p) => outboundPartSchema.parse(p));
  const textChunks = validated
    .filter((p): p is Extract<OutboundPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text.trim())
    .filter(Boolean);
  const attachmentIds = validated
    .filter((p): p is Extract<OutboundPart, { type: "attachment" }> => p.type === "attachment")
    .map((p) => p.attachmentId);

  return {
    plainText: textChunks.join("\n\n").trim(),
    attachmentIds,
    storageKeys: [],
    externalUrls: [],
    localPaths: [],
    parts: validated,
    directives: {},
  };
}

function parseAgentResponseText(text: string): AgentResponseParseResult {
  const directives = parseDirectives(text);
  let working = stripDirectives(text);

  const storageKeys: string[] = [];
  working = working.replace(MEDIA_TAG_RE, (_, key: string) => {
    storageKeys.push(key);
    return "";
  });

  const attachmentIds: string[] = [];
  const externalUrls: string[] = [];
  const localPaths: string[] = [];
  working = working.replace(MARKDOWN_IMAGE_RE, (_match, alt: string, target: string) => {
    const url = target.trim();
    const attachmentRef = parseAttachmentRef(url);
    if (attachmentRef) {
      attachmentIds.push(attachmentRef);
      return "";
    }
    if (STORAGE_KEY_RE.test(url)) {
      storageKeys.push(url);
      return "";
    }
    if (/^https?:\/\//i.test(url)) {
      externalUrls.push(url);
    }
    const label = alt.trim() || url;
    return `[Image: ${label}]`;
  });

  working = working.replace(LOCAL_UPLOAD_PATH_RE, (match, localPath: string) => {
    const storageKey = extractStorageKeyFromLocalPath(localPath);
    if (!storageKey) return match;
    localPaths.push(localPath);
    storageKeys.push(storageKey);
    return "";
  });

  working = working.replace(URL_RE, (url: string) => {
    externalUrls.push(url);
    return `[Link: ${url}]`;
  });

  const plainText = working.replace(/\n{3,}/g, "\n\n").trim();
  const parts: OutboundPart[] = [];
  if (plainText) parts.push({ type: "text", text: plainText });

  for (const id of attachmentIds) {
    parts.push({ type: "attachment", attachmentId: id });
  }

  return {
    plainText: plainText || "(attachment)",
    attachmentIds: [...new Set(attachmentIds)],
    storageKeys: [...new Set(storageKeys)],
    externalUrls: [...new Set(externalUrls)],
    localPaths: [...new Set(localPaths)],
    parts,
    directives,
  };
}

function parseDirectives(text: string): OutboundDirectives {
  return {
    asVoice: DIRECTIVE_AS_VOICE_RE.test(text),
    asDocument: DIRECTIVE_AS_DOCUMENT_RE.test(text),
  };
}

function stripDirectives(text: string): string {
  return text.replace(DIRECTIVE_AS_VOICE_RE, "").replace(DIRECTIVE_AS_DOCUMENT_RE, "").trim();
}

function parseAttachmentRef(url: string): string | null {
  if (url.startsWith("attachment:")) {
    const id = url.slice("attachment:".length).trim();
    return id.length > 0 ? id : null;
  }
  const contentMatch = url.match(/\/attachments\/([^/]+)\/content$/);
  if (contentMatch?.[1]) return contentMatch[1];
  return null;
}

export function isStorageKey(value: string): boolean {
  return STORAGE_KEY_RE.test(value);
}

function extractStorageKeyFromLocalPath(localPath: string): string | null {
  const last = localPath.split("/").at(-1);
  return last && STORAGE_KEY_RE.test(last) ? last : null;
}
