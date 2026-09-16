"use client";

import { AppHeader } from "@/components/layout/app-header";
import { EmailSettings } from "@/components/settings/email-settings";

export default function EmailsSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />
      <EmailSettings />
    </div>
  );
}
