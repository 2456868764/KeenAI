"use client";

import { fetchMe } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

const CHANNELS = [
  {
    id: "telegram",
    name: "Telegram",
    path: "/api/v1/webhooks/im/telegram",
    env: ["TELEGRAM_BOT_TOKEN"],
  },
  {
    id: "feishu",
    name: "Feishu / Lark",
    path: "/api/v1/webhooks/im/feishu",
    env: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
  },
  {
    id: "dingtalk",
    name: "DingTalk",
    path: "/api/v1/webhooks/im/dingtalk",
    env: ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"],
  },
  {
    id: "slack",
    name: "Slack",
    path: "/api/v1/webhooks/im/slack",
    env: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  },
  {
    id: "discord",
    name: "Discord",
    path: "/api/v1/webhooks/im/discord",
    env: ["DISCORD_BOT_TOKEN"],
  },
] as const;

export function ImChannelsSettings() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const orgSlug = me?.organization?.slug ?? "your-org";

  return (
    <div className="space-y-4">
      {CHANNELS.map((channel) => {
        const webhook = `${API_URL}${channel.path}?org=${encodeURIComponent(orgSlug)}`;
        return (
          <section
            key={channel.id}
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
          >
            <h2 className="text-sm font-medium">{channel.name}</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              POST inbound events to this URL. Optional header{" "}
              <code className="rounded bg-[hsl(var(--surface-2))] px-1">
                x-keenai-webhook-secret
              </code>{" "}
              when{" "}
              <code className="rounded bg-[hsl(var(--surface-2))] px-1">WEBHOOK_IM_SECRET</code> is
              set.
            </p>
            <code className="mt-3 block overflow-x-auto rounded-md bg-[hsl(var(--surface-2))] p-2 text-xs">
              {webhook}
            </code>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Env: {channel.env.join(", ")}
            </p>
          </section>
        );
      })}
    </div>
  );
}
