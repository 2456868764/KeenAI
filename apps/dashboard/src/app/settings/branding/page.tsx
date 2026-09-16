"use client";

import { AppHeader } from "@/components/layout/app-header";
import { BrandingSettings } from "@/components/settings/branding-settings";

export default function BrandingSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />
      <BrandingSettings />
    </div>
  );
}
