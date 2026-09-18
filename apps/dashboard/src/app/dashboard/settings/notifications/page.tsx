"use client";

import { AppHeader } from "@/components/layout/app-header";
import { NotificationSettings } from "@/components/settings/notification-settings";

export default function NotificationsSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />
      <NotificationSettings />
    </div>
  );
}
