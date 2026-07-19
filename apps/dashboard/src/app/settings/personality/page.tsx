"use client";

import { AppHeader } from "@/components/layout/app-header";
import { PersonalitySettingsForm } from "@/components/settings/personality-settings";

export default function PersonalitySettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
          Configure Keeni agent voice, system prompt, and guardrails per brand.
        </p>
        <PersonalitySettingsForm />
      </main>
    </div>
  );
}
