"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type ChannelConnection,
  type ChannelDeadLetter,
  type ChannelType,
  type WhatsAppTemplate,
  completeWhatsAppSignup,
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  disableChannelConnection,
  fetchMe,
  listBrands,
  listChannelConnections,
  listChannelDeadLetters,
  listWhatsAppTemplates,
  replayChannelDeadLetter,
  resolveChannelDeadLetter,
  saveChannelConnection,
  startDingTalkOAuth,
  startDiscordOAuth,
  startEmailOAuth,
  startFeishuOAuth,
  startSlackOAuth,
  startWeComOAuth,
  startWhatsAppSignup,
  testChannelConnection,
  updateWhatsAppTemplate,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Slack,
  Smartphone,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type FacebookSdk = {
  init: (options: {
    appId: string;
    version: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
  }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};

type FacebookWindow = Window & { FB?: FacebookSdk; fbAsyncInit?: () => void };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type Integration = {
  id: ChannelType;
  name: string;
  description: string;
  icon: LucideIcon;
  iconTone: string;
  action: "Connect" | "Configure";
  transport?: ChannelConnection["transport"];
  transports?: ChannelConnection["transport"][];
  webhookPath?: string;
  centralWebhook?: boolean;
  env?: string[];
  setup?: string;
  credentialFields: Array<{
    key: string;
    label: string;
    type?: "text" | "password" | "number";
    placeholder?: string;
  }>;
  settingFields?: Array<{
    key: string;
    label: string;
    type?: "text" | "number";
    placeholder?: string;
  }>;
};

const integrations: Integration[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Support customers in Slack and notify your team when feedback needs attention.",
    icon: Slack,
    iconTone: "text-emerald-500",
    action: "Connect",
    transports: ["webhook", "stream"],
    webhookPath: "/api/v1/webhooks/im/slack",
    centralWebhook: true,
    env: [
      "SLACK_CLIENT_ID",
      "SLACK_CLIENT_SECRET",
      "SLACK_SIGNING_SECRET",
      "SLACK_OAUTH_REDIRECT_URI",
    ],
    setup:
      "Install the Slack app through OAuth, then configure Events API or Socket Mode for inbound messages.",
    credentialFields: [
      { key: "botToken", label: "Bot token", type: "password" },
      { key: "appToken", label: "App-level token (Socket Mode)", type: "password" },
      { key: "signingSecret", label: "Signing secret", type: "password" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Capture feedback from your Discord community and route it into KeenAI.",
    icon: MessageCircle,
    iconTone: "text-indigo-500",
    action: "Configure",
    transport: "gateway",
    transports: ["gateway", "webhook"],
    webhookPath: "/api/v1/webhooks/im/discord",
    env: [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_BOT_TOKEN",
      "DISCORD_PUBLIC_KEY",
      "DISCORD_OAUTH_REDIRECT_URI",
    ],
    setup: "Connect a Discord bot token and forward message events to this endpoint.",
    credentialFields: [
      { key: "botToken", label: "Bot token", type: "password" },
      { key: "publicKey", label: "Application public key", type: "password" },
    ],
  },
  {
    id: "feishu",
    name: "Feishu",
    description: "Receive Feishu or Lark message events and send AI Agent replies back to chats.",
    icon: MessageSquare,
    iconTone: "text-blue-500",
    action: "Connect",
    transport: "stream",
    transports: ["stream", "webhook"],
    webhookPath: "/api/v1/webhooks/im/feishu",
    env: [
      "FEISHU_ISV_APP_ID",
      "FEISHU_ISV_APP_SECRET",
      "FEISHU_ISV_VERIFICATION_TOKEN",
      "FEISHU_ISV_ENCRYPT_KEY",
      "FEISHU_ISV_OAUTH_REDIRECT_URI",
    ],
    setup:
      "Install the Feishu marketplace app through OAuth. Self-built apps can still be configured manually.",
    credentialFields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App secret", type: "password" },
      { key: "tenantAccessToken", label: "Tenant access token (optional)", type: "password" },
      { key: "verificationToken", label: "Verification token", type: "password" },
      { key: "encryptKey", label: "Encrypt key (optional)", type: "password" },
    ],
  },
  {
    id: "dingtalk",
    name: "DingTalk",
    description:
      "Route DingTalk robot callbacks into support conversations and outbound responses.",
    icon: Bot,
    iconTone: "text-sky-500",
    action: "Connect",
    transport: "stream",
    transports: ["stream", "webhook"],
    webhookPath: "/api/v1/webhooks/im/dingtalk",
    env: [
      "DINGTALK_ISV_SUITE_KEY",
      "DINGTALK_ISV_SUITE_SECRET",
      "DINGTALK_ISV_CALLBACK_TOKEN",
      "DINGTALK_ISV_ENCODING_AES_KEY",
      "DINGTALK_ISV_OAUTH_REDIRECT_URI",
    ],
    setup:
      "Install the DingTalk marketplace app with administrator consent. Self-built applications can still be configured manually.",
    credentialFields: [
      { key: "appKey", label: "App key" },
      { key: "appSecret", label: "App secret", type: "password" },
      { key: "robotCode", label: "Robot code" },
      { key: "signingSecret", label: "Signing secret", type: "password" },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect a Telegram bot to ingest customer messages, media, and agent replies.",
    icon: Send,
    iconTone: "text-cyan-500",
    action: "Configure",
    transport: "polling",
    transports: ["polling", "webhook"],
    webhookPath: "/api/v1/webhooks/im/telegram",
    env: ["TELEGRAM_BOT_TOKEN", "CHANNEL_WEBHOOK_BASE_URL"],
    setup:
      "Create a Telegram bot with BotFather. Save and test the connection to register webhook mode automatically; polling mode removes any existing webhook.",
    credentialFields: [
      { key: "botToken", label: "Bot token", type: "password" },
      { key: "webhookSecret", label: "Webhook secret token", type: "password" },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect the official WhatsApp Cloud API for customer messages and replies.",
    icon: Smartphone,
    iconTone: "text-emerald-600",
    action: "Configure",
    webhookPath: "/api/v1/webhooks/im/whatsapp",
    centralWebhook: true,
    env: [
      "META_APP_ID",
      "META_APP_SECRET",
      "META_EMBEDDED_SIGNUP_CONFIG_ID",
      "WHATSAPP_VERIFY_TOKEN",
    ],
    setup: "Connect with Meta Embedded Signup or configure a Cloud API account manually.",
    credentialFields: [
      { key: "accessToken", label: "Access token", type: "password" },
      { key: "appSecret", label: "App secret", type: "password" },
      { key: "verifyToken", label: "Webhook verify token", type: "password" },
      { key: "phoneNumberId", label: "Phone number ID" },
      { key: "wabaId", label: "WhatsApp Business Account ID" },
      { key: "graphApiVersion", label: "Graph API version", placeholder: "v20.0" },
    ],
  },
  {
    id: "wechat",
    name: "WeChat Official Account",
    description:
      "Connect an authenticated WeChat Official Account for customer messages and AI replies.",
    icon: MessageCircle,
    iconTone: "text-green-600",
    action: "Configure",
    webhookPath: "/api/v1/webhooks/im/wechat",
    setup:
      "Configure this callback URL in the WeChat Official Account server settings. Safe mode is supported when an EncodingAESKey is provided.",
    credentialFields: [
      { key: "appId", label: "Official Account App ID" },
      { key: "appSecret", label: "App secret", type: "password" },
      { key: "callbackToken", label: "Callback token", type: "password" },
      { key: "encodingAesKey", label: "Encoding AES key (safe mode)", type: "password" },
      { key: "accessToken", label: "Access token (optional override)", type: "password" },
    ],
  },
  {
    id: "wecom",
    name: "WeCom",
    description: "Connect an official WeCom application for enterprise customer messaging.",
    icon: MessageSquare,
    iconTone: "text-green-600",
    action: "Connect",
    webhookPath: "/api/v1/webhooks/im/wecom",
    env: [
      "WECOM_SUITE_ID",
      "WECOM_SUITE_SECRET",
      "WECOM_SUITE_TOKEN",
      "WECOM_SUITE_ENCODING_AES_KEY",
      "WECOM_SUITE_OAUTH_REDIRECT_URI",
    ],
    setup:
      "Install the WeCom service-provider suite. Self-built applications can still be configured manually.",
    credentialFields: [
      { key: "corpId", label: "Corp ID" },
      { key: "corpSecret", label: "Corp secret", type: "password" },
      { key: "callbackToken", label: "Callback token", type: "password" },
      { key: "encodingAesKey", label: "Encoding AES key", type: "password" },
      { key: "accessToken", label: "Access token (optional)", type: "password" },
    ],
    settingFields: [{ key: "wecomAgentId", label: "Agent ID", type: "number" }],
  },
  {
    id: "email",
    name: "Email",
    description: "Receive support email and deliver durable SMTP replies from one channel runtime.",
    icon: Mail,
    iconTone: "text-rose-500",
    action: "Configure",
    transport: "polling",
    transports: ["polling", "webhook"],
    webhookPath: "/api/v1/webhooks/email/inbound",
    env: [
      "EMAIL_GOOGLE_CLIENT_ID",
      "EMAIL_GOOGLE_CLIENT_SECRET",
      "EMAIL_MICROSOFT_CLIENT_ID",
      "EMAIL_MICROSOFT_CLIENT_SECRET",
      "EMAIL_OAUTH_REDIRECT_URI",
    ],
    setup: "Configure inbound email forwarding and the SMTP account used for replies.",
    credentialFields: [
      { key: "host", label: "SMTP host" },
      { key: "port", label: "SMTP port", type: "number", placeholder: "587" },
      { key: "user", label: "SMTP user" },
      { key: "pass", label: "SMTP password", type: "password" },
      { key: "from", label: "From address" },
      { key: "imapHost", label: "IMAP host" },
      { key: "imapPort", label: "IMAP port", type: "number", placeholder: "993" },
      { key: "imapUser", label: "IMAP user" },
      { key: "imapPass", label: "IMAP password", type: "password" },
      { key: "imapMailbox", label: "IMAP mailbox", placeholder: "INBOX" },
      {
        key: "inboundWebhookSecret",
        label: "Inbound webhook secret",
        type: "password",
      },
      { key: "inboundWebhookUsername", label: "Inbound webhook basic auth user" },
      {
        key: "inboundWebhookPassword",
        label: "Inbound webhook basic auth password",
        type: "password",
      },
      {
        key: "sendgridWebhookVerificationKey",
        label: "SendGrid webhook verification key",
        type: "password",
      },
      {
        key: "mailgunWebhookSigningKey",
        label: "Mailgun webhook signing key",
        type: "password",
      },
    ],
    settingFields: [{ key: "sesTopicArn", label: "Amazon SES SNS topic ARN" }],
  },
  {
    id: "widget",
    name: "Widget",
    description: "Use the built-in Messenger widget through the unified channel runtime.",
    icon: Webhook,
    iconTone: "text-violet-500",
    action: "Configure",
    setup: "Widget delivery uses the authenticated Messenger connection and realtime event bus.",
    credentialFields: [],
  },
];

export default function IntegrationsSettingsPage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: brands } = useQuery({ queryKey: ["brands"], queryFn: listBrands });
  const orgSlug = me?.organization?.slug ?? "your-org";
  const brandId = me?.brandIds[0] ?? brands?.items[0]?.id;
  const { data: connections } = useQuery({
    queryKey: ["channel-connections", brandId],
    queryFn: () => listChannelConnections(brandId),
    enabled: Boolean(brandId),
  });
  const { data: deadLetters } = useQuery({
    queryKey: ["channel-dead-letters", "open"],
    queryFn: () => listChannelDeadLetters({ status: "open", limit: 50 }),
  });
  const [query, setQuery] = useState("");
  const [modalIntegration, setModalIntegration] = useState<Integration | null>(null);
  const [oauthOutcome, setOauthOutcome] = useState<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const outcome = search.get("slack");
    if (outcome === "connected") setOauthOutcome("Slack workspace connected.");
    if (outcome === "denied") setOauthOutcome("Slack installation was cancelled.");
    if (outcome === "failed") setOauthOutcome("Slack installation failed. Try connecting again.");
    const email = search.get("email");
    if (email === "connected") setOauthOutcome("Email account connected.");
    if (email === "denied") setOauthOutcome("Email authorization was cancelled.");
    if (email === "failed") setOauthOutcome("Email authorization failed. Try connecting again.");
    const discord = search.get("discord");
    if (discord === "connected") setOauthOutcome("Discord server connected.");
    if (discord === "denied") setOauthOutcome("Discord installation was cancelled.");
    if (discord === "failed") setOauthOutcome("Discord installation failed. Try connecting again.");
    const feishu = search.get("feishu");
    if (feishu === "connected") setOauthOutcome("Feishu tenant connected.");
    if (feishu === "denied") setOauthOutcome("Feishu installation was cancelled.");
    if (feishu === "failed") setOauthOutcome("Feishu installation failed. Try connecting again.");
    const wecom = search.get("wecom");
    if (wecom === "connected") setOauthOutcome("WeCom organization connected.");
    if (wecom === "denied") setOauthOutcome("WeCom installation was cancelled.");
    if (wecom === "failed") setOauthOutcome("WeCom installation failed. Try connecting again.");
    const dingtalk = search.get("dingtalk");
    if (dingtalk === "connected") setOauthOutcome("DingTalk organization connected.");
    if (dingtalk === "denied") setOauthOutcome("DingTalk installation was cancelled.");
    if (dingtalk === "failed")
      setOauthOutcome("DingTalk installation failed. Try connecting again.");
  }, []);

  const filteredIntegrations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return integrations.filter((integration) => {
      return (
        !normalizedQuery ||
        integration.name.toLowerCase().includes(normalizedQuery) ||
        integration.description.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query]);

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full px-8 py-8">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                Integrations
              </h1>
              <p className="mt-3 max-w-5xl text-lg text-[hsl(var(--muted-foreground))]">
                Connect KeenAI with the tools your team already uses to ship, support, and analyze
                customer feedback.
              </p>
            </div>
          </div>
          {oauthOutcome ? (
            <output className="mb-5 block text-sm text-[hsl(var(--foreground))]">
              {oauthOutcome}
            </output>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-7">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search integrations"
                  placeholder="Search"
                  className="h-12 rounded-lg bg-[hsl(var(--surface-1))] pl-12 text-base"
                />
              </div>

              <nav className="space-y-2" aria-label="Integration categories">
                <div className="flex h-11 w-full items-center rounded-lg bg-[hsl(var(--primary)/0.12)] px-4 text-left text-base font-semibold text-[hsl(var(--primary))]">
                  Communication
                </div>
              </nav>
            </aside>

            <section className="min-w-0">
              <div className="mb-5 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  Communication
                </h2>
                <span className="text-lg font-semibold text-[hsl(var(--muted-foreground))]">
                  ({filteredIntegrations.length})
                </span>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {filteredIntegrations.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onConfigure={() => setModalIntegration(integration)}
                  />
                ))}
              </div>

              {filteredIntegrations.length === 0 ? <EmptyState /> : null}

              <DeadLetterPanel items={deadLetters?.items ?? []} />
            </section>
          </div>
        </div>
      </main>
      {modalIntegration ? (
        <IntegrationConfigDialog
          integration={modalIntegration}
          orgSlug={orgSlug}
          brandId={brandId}
          connections={(connections?.items ?? []).filter(
            (connection) => connection.channelType === modalIntegration.id,
          )}
          onClose={() => setModalIntegration(null)}
        />
      ) : null}
    </div>
  );
}

function DeadLetterPanel({ items }: { items: ChannelDeadLetter[] }) {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["channel-dead-letters", "open"] });
  const replay = useMutation({
    mutationFn: replayChannelDeadLetter,
    onMutate: (id) => {
      setPendingId(id);
      setError(null);
    },
    onSuccess: refresh,
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Replay failed"),
    onSettled: () => setPendingId(null),
  });
  const resolve = useMutation({
    mutationFn: resolveChannelDeadLetter,
    onMutate: (id) => {
      setPendingId(id);
      setError(null);
    },
    onSuccess: refresh,
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Resolve failed"),
    onSettled: () => setPendingId(null),
  });

  return (
    <section className="mt-10" aria-labelledby="channel-failures-title">
      <div className="mb-4 flex items-center gap-2">
        <CircleAlert className="size-5 text-amber-500" />
        <h2
          id="channel-failures-title"
          className="text-lg font-semibold text-[hsl(var(--foreground))]"
        >
          Failed channel jobs
        </h2>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">({items.length})</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
        {items.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm text-[hsl(var(--muted-foreground))]">
            <CheckCircle2 className="size-5 text-emerald-500" />
            No unresolved channel jobs.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-4 border-b border-[hsl(var(--border))] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[hsl(var(--surface-2))] px-2 py-1 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                    {item.sourceType}
                  </span>
                  <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {item.reasonCode}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm text-[hsl(var(--muted-foreground))]">
                  {item.reason}
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {new Date(item.createdAt).toLocaleString()} · replayed {item.replayCount} times
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  disabled={pendingId === item.id}
                  onClick={() => resolve.mutate(item.id)}
                >
                  Resolve
                </Button>
                <Button disabled={pendingId === item.id} onClick={() => replay.mutate(item.id)}>
                  Replay
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

function IntegrationCard({
  integration,
  onConfigure,
}: {
  integration: Integration;
  onConfigure: () => void;
}) {
  const Icon = integration.icon;

  return (
    <article className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
          <Icon className={`size-7 ${integration.iconTone}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            {integration.name}
          </h3>
          <p className="mt-2 min-h-[56px] text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
            {integration.description}
          </p>
          <Button variant="outline" className="mt-4" onClick={onConfigure}>
            {integration.action}
          </Button>
        </div>
      </div>
    </article>
  );
}

function IntegrationConfigDialog({
  integration,
  orgSlug,
  brandId,
  connections,
  onClose,
}: {
  integration: Integration;
  orgSlug: string;
  brandId?: string;
  connections: ChannelConnection[];
  onClose: () => void;
}) {
  const Icon = integration.icon;
  const queryClient = useQueryClient();
  const [selectedConnectionId, setSelectedConnectionId] = useState(connections[0]?.id ?? "new");
  const connection = connections.find((item) => item.id === selectedConnectionId);
  const [externalAccountId, setExternalAccountId] = useState(
    connection?.externalAccountId ?? "default",
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(connection?.settings ?? {}).map(([key, value]) => [key, String(value)]),
    ),
  );
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<"google" | "microsoft">("google");
  const [oauthEmail, setOauthEmail] = useState(
    connection?.externalAccountId.includes("@") ? connection.externalAccountId : "",
  );
  const [dingtalkCorpId, setDingTalkCorpId] = useState(
    connection?.externalAccountId !== "default" ? (connection?.externalAccountId ?? "") : "",
  );
  const [transport, setTransport] = useState<ChannelConnection["transport"]>(
    connection?.transport ?? integration.transport ?? "webhook",
  );
  const [whatsappPin, setWhatsappPin] = useState("");
  const [facebookReady, setFacebookReady] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const signupCleanup = useRef<(() => void) | null>(null);
  const {
    data: whatsappSignup,
    error: whatsappSignupError,
    isFetching: whatsappSignupLoading,
    refetch: refreshWhatsAppSignup,
  } = useQuery({
    queryKey: ["whatsapp-signup", brandId],
    queryFn: () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      return startWhatsAppSignup(brandId);
    },
    enabled: integration.id === "whatsapp" && Boolean(brandId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    if (integration.id !== "whatsapp" || !whatsappSignup) return;
    const fbWindow = window as FacebookWindow;
    const init = () => {
      fbWindow.FB?.init({
        appId: whatsappSignup.appId,
        version: whatsappSignup.graphApiVersion,
        autoLogAppEvents: true,
        xfbml: false,
      });
      setFacebookReady(Boolean(fbWindow.FB));
    };
    fbWindow.fbAsyncInit = init;
    if (fbWindow.FB) init();
    else if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.onerror = () => setTestMessage("Meta signup could not load. Check your connection.");
      document.head.appendChild(script);
    }
    return () => {
      if (fbWindow.fbAsyncInit === init) fbWindow.fbAsyncInit = undefined;
      signupCleanup.current?.();
    };
  }, [integration.id, whatsappSignup]);
  useEffect(() => {
    setExternalAccountId(connection?.externalAccountId ?? "default");
    setCredentials({});
    setSettings(
      Object.fromEntries(
        Object.entries(connection?.settings ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    );
    setTransport(connection?.transport ?? integration.transport ?? "webhook");
    setTestMessage(null);
    setConfirmDisconnect(false);
    setOauthEmail(connection?.externalAccountId.includes("@") ? connection.externalAccountId : "");
    setDingTalkCorpId(
      connection?.externalAccountId !== "default" ? (connection?.externalAccountId ?? "") : "",
    );
  }, [connection, integration.transport]);
  const save = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      const values = Object.fromEntries(
        Object.entries(credentials)
          .filter(([, value]) => value.trim())
          .map(([key, value]) => [key, key === "port" ? Number(value) : value.trim()]),
      );
      const saved = await saveChannelConnection({
        brandId,
        channelType: integration.id,
        name: integration.name,
        externalAccountId: externalAccountId.trim() || "default",
        credentials: values,
        settings: {
          ...(connection?.settings ?? {}),
          ...Object.fromEntries(
            Object.entries(settings)
              .filter(([, value]) => value.trim())
              .map(([key, value]) => [
                key,
                integration.settingFields?.find((field) => field.key === key)?.type === "number"
                  ? Number(value)
                  : value.trim(),
              ]),
          ),
        },
        status: integration.id === "widget" ? "active" : "pending",
        transport,
      });
      const tested = await testChannelConnection(saved.connection.id);
      return { ...saved, testResult: tested.result };
    },
    onMutate: () => setTestMessage(null),
    onSuccess: async ({ testResult }) => {
      setTestMessage(
        testResult.verification === "configuration_only"
          ? "Configuration saved and checked. This provider does not expose a non-delivery identity check."
          : `Connected${testResult.displayName ? ` as ${testResult.displayName}` : ""}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["channel-connections", brandId] });
      onClose();
    },
    onError: async (error) => {
      setTestMessage(error instanceof Error ? error.message : "Connection could not be saved.");
      await queryClient.invalidateQueries({ queryKey: ["channel-connections", brandId] });
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error("Save the connection before testing it.");
      return testChannelConnection(connection.id);
    },
    onMutate: () => setTestMessage(null),
    onSuccess: async ({ result }) => {
      setTestMessage(
        result.verification === "configuration_only"
          ? "Configuration is valid; this provider does not expose a non-delivery verification call."
          : `Connected${result.displayName ? ` as ${result.displayName}` : ""}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["channel-connections", brandId] });
    },
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "Connection test failed."),
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error("No connection is selected.");
      return disableChannelConnection(connection.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["channel-connections", brandId] });
      onClose();
    },
    onError: (error) => {
      setConfirmDisconnect(false);
      setTestMessage(error instanceof Error ? error.message : "Connection could not be disabled.");
    },
  });
  const slackOAuth = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      return startSlackOAuth(brandId);
    },
    onMutate: () => setTestMessage(null),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "Slack installation failed."),
  });
  const discordOAuth = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      return startDiscordOAuth(brandId);
    },
    onMutate: () => setTestMessage(null),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "Discord installation failed."),
  });
  const feishuOAuth = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      return startFeishuOAuth(brandId);
    },
    onMutate: () => setTestMessage(null),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "Feishu installation failed."),
  });
  const wecomOAuth = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      return startWeComOAuth(brandId);
    },
    onMutate: () => setTestMessage(null),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "WeCom installation failed."),
  });
  const dingtalkOAuth = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      if (!dingtalkCorpId.trim()) throw new Error("Enter the DingTalk Corp ID.");
      return startDingTalkOAuth(brandId, dingtalkCorpId.trim());
    },
    onMutate: () => setTestMessage(null),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "DingTalk installation failed."),
  });
  const emailOAuth = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oauthEmail.trim())) {
        throw new Error("Enter a valid mailbox address.");
      }
      return startEmailOAuth({ brandId, provider: oauthProvider, email: oauthEmail.trim() });
    },
    onMutate: () => setTestMessage(null),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (error) =>
      setTestMessage(error instanceof Error ? error.message : "Email authorization failed."),
  });
  const launchWhatsAppSignup = () => {
    const fb = (window as FacebookWindow).FB;
    if (!fb || !whatsappSignup) return;
    if (whatsappPin && !/^\d{6}$/.test(whatsappPin)) {
      setTestMessage("Registration PIN must be six digits.");
      return;
    }
    signupCleanup.current?.();
    setSignupBusy(true);
    setTestMessage("Complete the Meta signup window to connect your number.");
    const session: { code?: string; wabaId?: string; phoneNumberId?: string; submitted?: boolean } =
      {};
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
      signupCleanup.current = null;
    };
    const submit = () => {
      if (!session.code || !session.wabaId || !session.phoneNumberId || session.submitted) return;
      session.submitted = true;
      cleanup();
      setTestMessage("Verifying your WhatsApp account...");
      void completeWhatsAppSignup({
        state: whatsappSignup.state,
        code: session.code,
        wabaId: session.wabaId,
        phoneNumberId: session.phoneNumberId,
        ...(whatsappPin ? { pin: whatsappPin } : {}),
      })
        .then(async () => {
          await queryClient.invalidateQueries({ queryKey: ["channel-connections", brandId] });
          setTestMessage("WhatsApp number connected.");
        })
        .catch((error: unknown) => {
          setTestMessage(error instanceof Error ? error.message : "WhatsApp signup failed.");
          void refreshWhatsAppSignup();
        })
        .finally(() => {
          setSignupBusy(false);
        });
    };
    const onMessage = (event: MessageEvent) => {
      let origin: URL;
      try {
        origin = new URL(event.origin);
      } catch {
        return;
      }
      if (
        origin.protocol !== "https:" ||
        (origin.hostname !== "facebook.com" && !origin.hostname.endsWith(".facebook.com"))
      )
        return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const value = payload as { type?: unknown; event?: unknown; data?: unknown };
      if (value.type !== "WA_EMBEDDED_SIGNUP") return;
      if (value.event === "CANCEL" || value.event === "ERROR") {
        cleanup();
        setSignupBusy(false);
        setTestMessage("WhatsApp signup was not completed.");
        return;
      }
      if (value.event !== "FINISH" && value.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")
        return;
      const data =
        value.data && typeof value.data === "object"
          ? (value.data as { waba_id?: unknown; phone_number_id?: unknown })
          : null;
      if (typeof data?.waba_id === "string" && typeof data.phone_number_id === "string") {
        session.wabaId = data.waba_id;
        session.phoneNumberId = data.phone_number_id;
        submit();
      }
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      setSignupBusy(false);
      setTestMessage("WhatsApp signup timed out. Start again.");
    }, 3 * 60_000);
    signupCleanup.current = cleanup;
    window.addEventListener("message", onMessage);
    fb.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          cleanup();
          setSignupBusy(false);
          setTestMessage("WhatsApp signup was cancelled.");
          return;
        }
        session.code = code;
        submit();
      },
      {
        config_id: whatsappSignup.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { sessionInfoVersion: "3" },
      },
    );
  };
  const isIsvConnection = connection?.configuredCredentialKeys.includes("appType") ?? false;
  const isDiscordOauthConnection =
    connection?.configuredCredentialKeys.includes("oauthAccessToken") ?? false;
  const webhookPath =
    isIsvConnection && integration.id === "dingtalk"
      ? "/api/v1/webhooks/im/dingtalk/suite"
      : isIsvConnection && integration.id === "wecom"
        ? "/api/v1/webhooks/im/wecom/suite"
        : integration.webhookPath;
  const usesCentralWebhook =
    integration.centralWebhook ||
    (isDiscordOauthConnection && integration.id === "discord") ||
    (isIsvConnection && integration.id === "feishu") ||
    (isIsvConnection && (integration.id === "dingtalk" || integration.id === "wecom"));
  const webhookUrl = webhookPath
    ? usesCentralWebhook
      ? `${API_URL}${webhookPath}`
      : `${API_URL}${webhookPath}?org=${encodeURIComponent(orgSlug)}${
          connection ? `&connection=${encodeURIComponent(connection.id)}` : ""
        }`
    : null;

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-screen max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/45 p-6 text-sm backdrop:bg-transparent backdrop-blur-sm"
      aria-labelledby="integration-config-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-2))]">
              <Icon className={`size-5 ${integration.iconTone}`} />
            </div>
            <div>
              <h2
                id="integration-config-title"
                className="text-base font-semibold text-[hsl(var(--foreground))]"
              >
                {integration.name} settings
              </h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {integration.setup ??
                  "Configuration UI is ready. Connect the backend credential flow when this integration is enabled."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
            aria-label="Close integration settings"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6">
          {webhookUrl ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor="channel-connection" className="block space-y-2 text-sm font-medium">
                  <span>Configured account</span>
                  <select
                    id="channel-connection"
                    value={selectedConnectionId}
                    onChange={(event) => setSelectedConnectionId(event.target.value)}
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm text-[hsl(var(--foreground))]"
                  >
                    {connections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.externalAccountId}
                      </option>
                    ))}
                    <option value="new">Add another account</option>
                  </select>
                </label>
                <label
                  htmlFor="channel-external-account"
                  className="block space-y-2 text-sm font-medium"
                >
                  <span>External account ID</span>
                  <Input
                    id="channel-external-account"
                    value={externalAccountId}
                    disabled={Boolean(connection)}
                    onChange={(event) => setExternalAccountId(event.target.value)}
                    placeholder="workspace, bot, phone, or mailbox ID"
                  />
                </label>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Webhook URL</h3>
                <code className="mt-2 block overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
                  {webhookUrl}
                </code>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Required environment variables
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {integration.env?.map((env) => (
                    <code
                      key={env}
                      className="rounded-md bg-[hsl(var(--surface-2))] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]"
                    >
                      {env}
                    </code>
                  ))}
                </div>
              </div>

              {integration.transports && integration.transports.length > 1 ? (
                <label htmlFor="channel-transport" className="block space-y-2 text-sm font-medium">
                  <span>Connection mode</span>
                  <select
                    id="channel-transport"
                    value={transport}
                    onChange={(event) =>
                      setTransport(event.target.value as ChannelConnection["transport"])
                    }
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm text-[hsl(var(--foreground))]"
                  >
                    {integration.transports.map((value) => (
                      <option key={value} value={value}>
                        {value === "stream"
                          ? integration.id === "slack"
                            ? "Socket Mode"
                            : "Long connection"
                          : value === "polling"
                            ? integration.id === "email"
                              ? "IMAP polling"
                              : "Long polling"
                            : value === "gateway"
                              ? "Gateway"
                              : "Webhook"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {integration.credentialFields.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {integration.credentialFields.map((field) => (
                    <label
                      key={field.key}
                      htmlFor={`channel-credential-${field.key}`}
                      className="space-y-2 text-sm font-medium"
                    >
                      <span>{field.label}</span>
                      <Input
                        id={`channel-credential-${field.key}`}
                        type={field.type ?? "text"}
                        inputMode={field.type === "number" ? "numeric" : undefined}
                        value={credentials[field.key] ?? ""}
                        onChange={(event) =>
                          setCredentials((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        placeholder={
                          connection?.configuredCredentialKeys.includes(field.key)
                            ? "Configured - leave blank to keep"
                            : field.placeholder
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {integration.id === "email" ? (
                <div className="grid gap-3 rounded-md border border-[hsl(var(--border))] p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                  <label className="space-y-2 text-sm font-medium" htmlFor="email-oauth-provider">
                    <span>Provider</span>
                    <select
                      id="email-oauth-provider"
                      value={oauthProvider}
                      onChange={(event) =>
                        setOauthProvider(event.target.value as "google" | "microsoft")
                      }
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm"
                    >
                      <option value="google">Gmail</option>
                      <option value="microsoft">Microsoft 365</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium" htmlFor="email-oauth-address">
                    <span>Mailbox address</span>
                    <Input
                      id="email-oauth-address"
                      type="email"
                      value={oauthEmail}
                      onChange={(event) => setOauthEmail(event.target.value)}
                      placeholder="support@example.com"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!brandId || emailOAuth.isPending}
                    onClick={() => emailOAuth.mutate()}
                  >
                    {emailOAuth.isPending ? "Connecting..." : "Connect OAuth"}
                  </Button>
                </div>
              ) : null}
              {integration.id === "dingtalk" ? (
                <div className="grid gap-3 rounded-md border border-[hsl(var(--border))] p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="space-y-2 text-sm font-medium" htmlFor="dingtalk-corp-id">
                    <span>Organization Corp ID</span>
                    <Input
                      id="dingtalk-corp-id"
                      value={dingtalkCorpId}
                      onChange={(event) => setDingTalkCorpId(event.target.value)}
                      placeholder="dingxxxxxxxxxxxxxxxx"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!brandId || !dingtalkCorpId.trim() || dingtalkOAuth.isPending}
                    onClick={() => dingtalkOAuth.mutate()}
                  >
                    {dingtalkOAuth.isPending ? "Connecting..." : "Connect DingTalk"}
                  </Button>
                </div>
              ) : null}
              {integration.id === "whatsapp" ? (
                <div className="space-y-4 border-t border-[hsl(var(--border))] pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label
                      className="space-y-2 text-sm font-medium"
                      htmlFor="whatsapp-registration-pin"
                    >
                      <span>Phone registration PIN (optional)</span>
                      <Input
                        id="whatsapp-registration-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={whatsappPin}
                        onChange={(event) => setWhatsappPin(event.target.value)}
                        placeholder="6 digits"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !facebookReady || !whatsappSignup || whatsappSignupLoading || signupBusy
                      }
                      onClick={launchWhatsAppSignup}
                    >
                      Connect with Meta
                    </Button>
                    {whatsappSignupError ? (
                      <p className="w-full text-xs text-red-600">
                        {whatsappSignupError instanceof Error
                          ? whatsappSignupError.message
                          : "Meta signup is unavailable."}
                      </p>
                    ) : null}
                  </div>
                  {connection ? <WhatsAppTemplateManager connectionId={connection.id} /> : null}
                </div>
              ) : null}
              {integration.settingFields && integration.settingFields.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {integration.settingFields.map((field) => (
                    <label
                      key={field.key}
                      htmlFor={`channel-setting-${field.key}`}
                      className="space-y-2 text-sm font-medium"
                    >
                      <span>{field.label}</span>
                      <Input
                        id={`channel-setting-${field.key}`}
                        type={field.type ?? "text"}
                        inputMode={field.type === "number" ? "numeric" : undefined}
                        value={settings[field.key] ?? ""}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Status: {connection?.status ?? "Not configured"}
                {connection ? ` · ${connection.transport} · ${connection.runtimeState}` : ""}
              </p>
              {testMessage ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{testMessage}</p>
              ) : null}
              {confirmDisconnect && connection ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-950">
                  <p className="font-semibold">Disconnect {connection.name}?</p>
                  <p className="mt-1 text-red-800">
                    New inbound and outbound work for this account will stop. Existing conversation
                    history is retained.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={disconnect.isPending}
                      onClick={() => disconnect.mutate()}
                    >
                      {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg bg-[hsl(var(--surface-2))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              {integration.id === "widget"
                ? "Widget is built in. It uses authenticated Messenger sessions, the realtime event bus, and durable channel delivery without external provider credentials."
                : "This integration does not require a public webhook. Configure its connection settings below."}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] p-4">
          {connection ? (
            <Button
              variant="outline"
              className="mr-auto text-red-600"
              disabled={disconnect.isPending}
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect
            </Button>
          ) : null}
          {integration.id === "slack" ? (
            <Button
              variant="outline"
              disabled={!brandId || slackOAuth.isPending}
              onClick={() => slackOAuth.mutate()}
            >
              {slackOAuth.isPending ? "Connecting..." : "Connect Slack"}
            </Button>
          ) : null}
          {integration.id === "discord" ? (
            <Button
              variant="outline"
              disabled={!brandId || discordOAuth.isPending}
              onClick={() => discordOAuth.mutate()}
            >
              {discordOAuth.isPending ? "Connecting..." : "Connect Discord"}
            </Button>
          ) : null}
          {integration.id === "feishu" ? (
            <Button
              variant="outline"
              disabled={!brandId || feishuOAuth.isPending}
              onClick={() => feishuOAuth.mutate()}
            >
              {feishuOAuth.isPending ? "Connecting..." : "Connect Feishu"}
            </Button>
          ) : null}
          {integration.id === "wecom" ? (
            <Button
              variant="outline"
              disabled={!brandId || wecomOAuth.isPending}
              onClick={() => wecomOAuth.mutate()}
            >
              {wecomOAuth.isPending ? "Connecting..." : "Connect WeCom"}
            </Button>
          ) : null}
          {connection ? (
            <Button variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? "Testing..." : "Test connection"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!brandId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </section>
    </dialog>
  );
}

const emptyWhatsAppTemplateDraft = {
  name: "",
  language: "en_US",
  category: "UTILITY" as "AUTHENTICATION" | "MARKETING" | "UTILITY",
  components: '[\n  {\n    "type": "BODY",\n    "text": ""\n  }\n]',
  allowCategoryChange: false,
};

function WhatsAppTemplateManager({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyWhatsAppTemplateDraft);
  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const templates = useQuery({
    queryKey: ["whatsapp-templates", connectionId],
    queryFn: () => listWhatsAppTemplates(connectionId),
  });
  const saveTemplate = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      let components: Record<string, unknown>[];
      try {
        const value: unknown = JSON.parse(draft.components);
        if (!Array.isArray(value) || value.length === 0) throw new Error();
        components = value.map((component) => {
          if (!component || typeof component !== "object" || Array.isArray(component)) {
            throw new Error();
          }
          return component as Record<string, unknown>;
        });
      } catch {
        throw new Error("Components must be a non-empty JSON array of objects.");
      }
      const input = {
        name: draft.name.trim(),
        language: draft.language.trim(),
        category: draft.category,
        components,
      };
      return editing
        ? updateWhatsAppTemplate(connectionId, editing.id, input)
        : createWhatsAppTemplate(connectionId, {
            ...input,
            allowCategoryChange: draft.allowCategoryChange,
          });
    },
    onSuccess: async () => {
      setEditing(null);
      setDraft(emptyWhatsAppTemplateDraft);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-templates", connectionId] });
    },
    onError: (error) =>
      setErrorMessage(error instanceof Error ? error.message : "Template save failed."),
  });
  const removeTemplate = useMutation({
    mutationFn: async (template: WhatsAppTemplate) =>
      deleteWhatsAppTemplate(connectionId, template),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-templates", connectionId] });
    },
    onError: (error) =>
      setErrorMessage(error instanceof Error ? error.message : "Template delete failed."),
  });
  const beginEdit = (template: WhatsAppTemplate) => {
    setEditing(template);
    setDraft({
      name: template.name,
      language: template.language,
      category:
        template.category === "AUTHENTICATION" ||
        template.category === "MARKETING" ||
        template.category === "UTILITY"
          ? template.category
          : "UTILITY",
      components: JSON.stringify(template.components, null, 2),
      allowCategoryChange: false,
    });
    setErrorMessage(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft(emptyWhatsAppTemplateDraft);
    setErrorMessage(null);
  };

  return (
    <section className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Message templates</h3>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            Meta approval status is read directly from the connected business account.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={templates.isFetching}
          onClick={() => void templates.refetch()}
          aria-label="Refresh WhatsApp templates"
          title="Refresh templates"
        >
          <RefreshCw className={`size-4 ${templates.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {templates.isError ? (
        <p className="text-xs text-red-600">
          {templates.error instanceof Error ? templates.error.message : "Templates could not load."}
        </p>
      ) : null}
      <div className="space-y-2">
        {templates.data?.items.map((template) => (
          <div
            key={template.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{template.name}</span>
                <span className="rounded bg-[hsl(var(--surface-2))] px-1.5 py-0.5 text-[11px] font-medium">
                  {template.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                {template.language} · {template.category}
                {template.rejectedReason ? ` · ${template.rejectedReason}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md hover:bg-[hsl(var(--surface-2))]"
                onClick={() => beginEdit(template)}
                aria-label={`Edit ${template.name}`}
                title="Edit template"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                onClick={() => setDeleteTarget(template)}
                aria-label={`Delete ${template.name}`}
                title="Delete template"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {!templates.isLoading && templates.data?.items.length === 0 ? (
          <p className="rounded-md bg-[hsl(var(--surface-2))] px-3 py-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
            No templates in this WhatsApp Business Account.
          </p>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-[hsl(var(--border))] pt-3">
        <div className="flex items-center gap-2">
          <Plus className="size-4" />
          <h4 className="text-sm font-semibold">{editing ? "Edit template" : "Create template"}</h4>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium" htmlFor="whatsapp-template-name">
            <span>Name</span>
            <Input
              id="whatsapp-template-name"
              value={draft.name}
              onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
              placeholder="order_update"
            />
          </label>
          <label className="space-y-1 text-xs font-medium" htmlFor="whatsapp-template-language">
            <span>Language</span>
            <Input
              id="whatsapp-template-language"
              value={draft.language}
              onChange={(event) =>
                setDraft((value) => ({ ...value, language: event.target.value }))
              }
              placeholder="en_US"
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs font-medium" htmlFor="whatsapp-template-category">
          <span>Category</span>
          <select
            id="whatsapp-template-category"
            value={draft.category}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                category: event.target.value as typeof value.category,
              }))
            }
            className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm"
          >
            <option value="UTILITY">Utility</option>
            <option value="MARKETING">Marketing</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
        </label>
        <label
          className="block space-y-1 text-xs font-medium"
          htmlFor="whatsapp-template-components"
        >
          <span>Components JSON</span>
          <textarea
            id="whatsapp-template-components"
            value={draft.components}
            onChange={(event) =>
              setDraft((value) => ({ ...value, components: event.target.value }))
            }
            rows={8}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] p-3 font-mono text-xs text-[hsl(var(--foreground))]"
          />
        </label>
        {!editing ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.allowCategoryChange}
              onChange={(event) =>
                setDraft((value) => ({ ...value, allowCategoryChange: event.target.checked }))
              }
            />
            Allow Meta to change the category during review
          </label>
        ) : null}
        {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
        <div className="flex justify-end gap-2">
          {editing ? (
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!draft.name.trim() || !draft.language.trim() || saveTemplate.isPending}
            onClick={() => saveTemplate.mutate()}
          >
            {saveTemplate.isPending ? "Saving..." : editing ? "Save template" : "Submit for review"}
          </Button>
        </div>
      </div>

      {deleteTarget ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-950">
          <p className="font-semibold">Delete {deleteTarget.name}?</p>
          <p className="mt-1 text-red-800">
            Meta deletes the selected template language. This action cannot be undone here.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={removeTemplate.isPending}
              onClick={() => removeTemplate.mutate(deleteTarget)}
            >
              {removeTemplate.isPending ? "Deleting..." : "Delete template"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mt-6 rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-8 text-center">
      <Boxes className="mx-auto size-8 text-[hsl(var(--muted-foreground))]" />
      <h2 className="mt-3 text-base font-semibold text-[hsl(var(--foreground))]">
        No integrations found
      </h2>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        Try another category or search term.
      </p>
    </section>
  );
}
