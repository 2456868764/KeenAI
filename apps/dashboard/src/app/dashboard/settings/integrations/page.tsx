"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type ChannelConnection,
  type ChannelDeadLetter,
  type ChannelType,
  fetchMe,
  listBrands,
  listChannelConnections,
  listChannelDeadLetters,
  replayChannelDeadLetter,
  resolveChannelDeadLetter,
  saveChannelConnection,
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
  Search,
  Send,
  Slack,
  Smartphone,
  Webhook,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type Integration = {
  id: ChannelType;
  name: string;
  description: string;
  icon: LucideIcon;
  iconTone: string;
  action: "Connect" | "Configure";
  transport?: ChannelConnection["transport"];
  webhookPath?: string;
  env?: string[];
  setup?: string;
  credentialFields: Array<{
    key: string;
    label: string;
    type?: "text" | "password" | "number";
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
    webhookPath: "/api/v1/webhooks/im/slack",
    env: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
    setup:
      "Create a Slack app, subscribe to message events, then paste this webhook URL into Slack.",
    credentialFields: [
      { key: "botToken", label: "Bot token", type: "password" },
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
    webhookPath: "/api/v1/webhooks/im/discord",
    env: ["DISCORD_BOT_TOKEN"],
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
    action: "Configure",
    webhookPath: "/api/v1/webhooks/im/feishu",
    env: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
    setup: "Create a Feishu/Lark bot app, enable event subscriptions, then use this request URL.",
    credentialFields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App secret", type: "password" },
      { key: "tenantAccessToken", label: "Tenant access token (optional)", type: "password" },
      { key: "verificationToken", label: "Verification token", type: "password" },
    ],
  },
  {
    id: "dingtalk",
    name: "DingTalk",
    description:
      "Route DingTalk robot callbacks into support conversations and outbound responses.",
    icon: Bot,
    iconTone: "text-sky-500",
    action: "Configure",
    webhookPath: "/api/v1/webhooks/im/dingtalk",
    env: ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"],
    setup: "Configure a DingTalk custom robot callback and set the app credentials in API env.",
    credentialFields: [{ key: "signingSecret", label: "Signing secret", type: "password" }],
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect a Telegram bot to ingest customer messages, media, and agent replies.",
    icon: Send,
    iconTone: "text-cyan-500",
    action: "Configure",
    webhookPath: "/api/v1/webhooks/im/telegram",
    env: ["TELEGRAM_BOT_TOKEN"],
    setup: "Create a Telegram bot with BotFather and register this webhook URL for updates.",
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
    env: ["WHATSAPP_VERIFY_TOKEN"],
    setup: "Configure a Meta WhatsApp Cloud API app and register this webhook URL.",
    credentialFields: [
      { key: "accessToken", label: "Access token", type: "password" },
      { key: "appSecret", label: "App secret", type: "password" },
      { key: "verifyToken", label: "Webhook verify token", type: "password" },
      { key: "phoneNumberId", label: "Phone number ID" },
      { key: "graphApiVersion", label: "Graph API version", placeholder: "v20.0" },
    ],
  },
  {
    id: "wecom",
    name: "WeCom",
    description: "Connect an official WeCom application for enterprise customer messaging.",
    icon: MessageSquare,
    iconTone: "text-green-600",
    action: "Configure",
    webhookPath: "/api/v1/webhooks/im/wecom",
    setup: "Configure a WeCom application callback and outbound application credentials.",
    credentialFields: [
      { key: "corpId", label: "Corp ID" },
      { key: "corpSecret", label: "Corp secret", type: "password" },
      { key: "callbackToken", label: "Callback token", type: "password" },
      { key: "encodingAesKey", label: "Encoding AES key", type: "password" },
      { key: "accessToken", label: "Access token (optional)", type: "password" },
    ],
  },
  {
    id: "email",
    name: "Email",
    description: "Receive support email and deliver durable SMTP replies from one channel runtime.",
    icon: Mail,
    iconTone: "text-rose-500",
    action: "Configure",
    webhookPath: "/api/v1/webhooks/email/inbound",
    setup: "Configure inbound email forwarding and the SMTP account used for replies.",
    credentialFields: [
      { key: "host", label: "SMTP host" },
      { key: "port", label: "SMTP port", type: "number", placeholder: "587" },
      { key: "user", label: "SMTP user" },
      { key: "pass", label: "SMTP password", type: "password" },
      { key: "from", label: "From address" },
    ],
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
          connection={connections?.items.find(
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
  connection,
  onClose,
}: {
  integration: Integration;
  orgSlug: string;
  brandId?: string;
  connection?: ChannelConnection;
  onClose: () => void;
}) {
  const Icon = integration.icon;
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand is available for this workspace.");
      const values = Object.fromEntries(
        Object.entries(credentials)
          .filter(([, value]) => value.trim())
          .map(([key, value]) => [key, key === "port" ? Number(value) : value.trim()]),
      );
      return saveChannelConnection({
        brandId,
        channelType: integration.id,
        name: integration.name,
        credentials: values,
        settings: connection?.settings ?? {},
        status: "active",
        transport: integration.transport ?? "webhook",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["channel-connections", brandId] });
      onClose();
    },
  });
  const webhookUrl = integration.webhookPath
    ? `${API_URL}${integration.webhookPath}?org=${encodeURIComponent(orgSlug)}${
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
      <section className="w-full max-w-2xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
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

              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Optional header{" "}
                <code className="rounded bg-[hsl(var(--surface-2))] px-1">
                  x-keenai-webhook-secret
                </code>{" "}
                is supported when{" "}
                <code className="rounded bg-[hsl(var(--surface-2))] px-1">WEBHOOK_IM_SECRET</code>{" "}
                is set.
              </p>

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
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Status: {connection?.status ?? "Not configured"}
                {connection ? ` · ${connection.transport} · ${connection.runtimeState}` : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-[hsl(var(--surface-2))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              This integration is listed for workspace planning. Add provider credentials and sync
              handlers before enabling live configuration.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] p-4">
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
