"use client";

import { AppHeader } from "@/components/layout/app-header";
import { ImChannelsSettings } from "@/components/settings/im-channels-settings";

export default function ChannelsSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
          Configure Telegram, Feishu/Lark, DingTalk, Slack, and Discord inbound webhooks.
        </p>
        <ImChannelsSettings />
      </main>
    </div>
  );
}
