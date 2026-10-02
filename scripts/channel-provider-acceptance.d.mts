export type AcceptanceMode = "connections" | "roundtrip" | "full";

export type AcceptanceProbe = {
  conversationId: string;
  inboundToken: string;
  outboundAckToken: string;
  outboundText?: string;
  editedText?: string;
  reactionEmoji?: string;
  inboundAttachmentFileName?: string;
  attachmentPath?: string;
  attachmentContentType?: string;
  attachmentFileName?: string;
  interactivePromptToken?: string;
  interactiveButtonId?: string;
  interactiveCompletionToken?: string;
  templateName?: string;
  templateLanguageCode?: string;
  templateComponents?: Array<Record<string, unknown>>;
};

export type AcceptanceConfig = {
  apiUrl: string;
  accessToken?: string;
  email?: string;
  password?: string;
  orgSlug?: string;
  brandId?: string;
  channels: string[];
  mode: AcceptanceMode;
  probes: Record<string, AcceptanceProbe>;
  timeoutMs: number;
  pollIntervalMs: number;
  requestTimeoutMs: number;
  inboundMaxAgeMinutes: number;
  allowConfigurationOnly: string[];
  reportPath?: string;
};

export type AcceptanceConnectionResult = {
  id: string;
  name: string;
  transport: string;
  verification?: string;
  passed: boolean;
  error?: string;
};

export type AcceptanceRoundtripResult = {
  passed: boolean;
  conversationId?: string;
  inboundMessageId?: string;
  outboundMessageId?: string;
  outboundAckMessageId?: string;
  deliveryStatus?: string;
  capabilities?: string[];
  features?: Array<{
    feature: string;
    passed: boolean;
    skipped?: boolean;
    reason?: string;
  }>;
  error?: string;
};

export type AcceptanceChannelResult = {
  channel: string;
  passed: boolean;
  connections: AcceptanceConnectionResult[];
  roundtrip: AcceptanceRoundtripResult | null;
  error?: string;
};

export type AcceptanceReport = {
  startedAt: string;
  finishedAt: string | null;
  mode: AcceptanceMode;
  apiUrl: string;
  brandId: string | null;
  passed: boolean;
  channels: AcceptanceChannelResult[];
  error?: string;
};

export const SUPPORTED_CHANNELS: string[];

export type AcceptanceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function acceptanceConfig(env?: Record<string, string | undefined>): AcceptanceConfig;

export function runChannelProviderAcceptance(
  config: AcceptanceConfig,
  dependencies?: {
    fetchImpl?: AcceptanceFetch;
    sleep?: (milliseconds: number) => Promise<void>;
    readFileImpl?: (path: string) => Promise<Uint8Array>;
  },
): Promise<AcceptanceReport>;
