"use client";

import { AppHeader } from "@/components/layout/app-header";
import { ProfileSettings } from "@/components/settings/profile-settings";

export default function ProfileSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />
      <ProfileSettings />
    </div>
  );
}
