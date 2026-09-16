"use client";

import { fetchMe } from "@/lib/api";
import { clearAccessToken } from "@/lib/auth-store";
import { Button, Input } from "@keenai/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Check,
  DoorOpen,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Pencil,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ThemeChoice = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "keenai_dashboard_theme";

function applyTheme(choice: ThemeChoice) {
  if (typeof window === "undefined") return;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme =
    choice === "system" ? (systemDark ? "dark" : "light") : choice;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "User";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function ProfileSettings() {
  const router = useRouter();
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const account = me?.account;
  const fallbackEmail = "wuswoo2009@gmail.com";
  const initialEmail = account?.email ?? fallbackEmail;
  const initialName = account?.name ?? nameFromEmail(initialEmail);
  const initials = useMemo(
    () =>
      initialName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "K",
    [initialName],
  );

  const [email, setEmail] = useState(initialEmail);
  const [emailEditing, setEmailEditing] = useState(false);
  const [fullName, setFullName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("light");
  const [status, setStatus] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  useEffect(() => {
    setEmail(initialEmail);
    setFullName(initialName);
  }, [initialEmail, initialName]);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice | null)
        : null;
    const nextTheme =
      stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function selectTheme(choice: ThemeChoice) {
    setTheme(choice);
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    applyTheme(choice);
    setStatus(`Theme set to ${choice}.`);
  }

  function signOut() {
    clearAccessToken();
    router.replace("/login");
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[hsl(var(--surface-0))]">
      <div className="mx-auto w-full max-w-[900px] px-6 py-8">
        <SectionIntro
          title="Personal information"
          description="Manage your personal profile information."
        />

        <section className="mb-10 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
          <SettingsRow title="Profile picture">
            <div className="ml-auto flex items-center gap-3">
              {isLoading ? (
                <Loader2 className="size-5 animate-spin text-[hsl(var(--muted-foreground))]" />
              ) : account?.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="size-10 rounded-full object-cover ring-2 ring-[hsl(var(--primary))]"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-sm">
                  {initials}
                </div>
              )}
            </div>
          </SettingsRow>

          <SettingsRow title="Email">
            {emailEditing ? (
              <form
                className="ml-auto flex w-full max-w-sm items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setEmailEditing(false);
                  setStatus("Email updated locally. Connect profile API to persist it.");
                }}
              >
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-9 bg-[hsl(var(--surface-0))]"
                  type="email"
                />
                <Button size="sm" type="submit">
                  Save
                </Button>
              </form>
            ) : (
              <div className="ml-auto flex min-w-0 items-center gap-3">
                <span className="truncate text-sm font-medium text-[hsl(var(--muted-foreground))]">
                  {email}
                </span>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Edit email"
                  title="Edit email"
                  onClick={() => setEmailEditing(true)}
                >
                  <Pencil className="size-4" />
                </button>
              </div>
            )}
          </SettingsRow>

          <SettingsRow title="Full name">
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="ml-auto h-9 w-full max-w-[280px] bg-[hsl(var(--surface-0))]"
            />
          </SettingsRow>

          <SettingsRow title="Description" last>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A short bio or role"
              className="ml-auto h-9 w-full max-w-[280px] bg-[hsl(var(--surface-0))]"
            />
          </SettingsRow>
        </section>

        <SectionIntro
          title="Theme"
          description="Select a theme to personalize your dashboard's appearance."
        />
        <section className="mb-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <ThemeCard
              label="Light"
              icon={Sun}
              selected={theme === "light"}
              preview="light"
              onClick={() => selectTheme("light")}
            />
            <ThemeCard
              label="Dark"
              icon={Moon}
              selected={theme === "dark"}
              preview="dark"
              onClick={() => selectTheme("dark")}
            />
            <ThemeCard
              label="System"
              icon={Laptop}
              selected={theme === "system"}
              preview="system"
              onClick={() => selectTheme("system")}
            />
          </div>
        </section>

        <SectionIntro title="Security" description="Manage your password and account security." />
        <section className="mb-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5 shadow-sm">
          <ActionRow
            icon={KeyRound}
            title="Password"
            description="Reset your password via email."
            action={
              <Button
                variant="outline"
                onClick={() => setStatus(`Password reset email queued for ${email}.`)}
              >
                Reset password
              </Button>
            }
          />
        </section>

        <SectionIntro
          title="Two-factor authentication"
          description="Add an extra layer of security by requiring a verification code in addition to your password when signing in."
        />
        <section className="mb-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5 shadow-sm">
          <ActionRow
            icon={ShieldCheck}
            title="Authenticator app"
            description="Use an app like 1Password, Google Authenticator or Authy to generate verification codes."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setTwoFactorEnabled((enabled) => !enabled);
                  setStatus(
                    twoFactorEnabled
                      ? "Two-factor setup was disabled locally."
                      : "Authenticator setup is ready to connect to the security API.",
                  );
                }}
              >
                {twoFactorEnabled ? (
                  <Check className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {twoFactorEnabled ? "Enabled" : "Set up"}
              </Button>
            }
          />
        </section>

        <SectionIntro title="Account" description="Sign out or permanently delete your account." />
        <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5 shadow-sm">
          <ActionRow
            icon={DoorOpen}
            title="Sign out"
            description="Log out of your current session."
            action={
              <Button variant="outline" onClick={signOut}>
                <LogOut className="size-4" />
                Sign out
              </Button>
            }
          />
          <div className="my-5 h-px bg-[hsl(var(--border))]" />
          <ActionRow
            icon={Trash2}
            title="Delete account"
            description="Permanently delete your account and all associated data. This cannot be undone."
            action={
              <Button
                variant={deleteConfirming ? "destructive" : "outline"}
                onClick={() => {
                  if (!deleteConfirming) {
                    setDeleteConfirming(true);
                    setStatus("Click Delete account again to confirm.");
                    return;
                  }
                  setStatus("Delete account requires a backend account deletion endpoint.");
                }}
              >
                <Trash2 className="size-4" />
                Delete account
              </Button>
            }
          />
        </section>

        {status ? (
          <output className="mt-5 flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
            <Bell className="size-4 text-[hsl(var(--primary))]" />
            {status}
          </output>
        ) : null}
      </div>
    </main>
  );
}

function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h2>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
    </div>
  );
}

function SettingsRow({
  title,
  children,
  last = false,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[64px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center ${
        last ? "" : "border-b border-[hsl(var(--border))]"
      }`}
    >
      <div className="w-full max-w-[220px] text-sm font-semibold text-[hsl(var(--foreground))]">
        {title}
      </div>
      {children}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function ThemeCard({
  label,
  icon: Icon,
  selected,
  preview,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  preview: ThemeChoice;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-lg border p-2 text-left transition ${
        selected
          ? "border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary)/0.35)]"
          : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.7)]"
      }`}
    >
      <ThemePreview mode={preview} />
      <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold">
        <Icon
          className={`size-4 ${selected ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
        />
        <span>{label}</span>
      </div>
    </button>
  );
}

function ThemePreview({ mode }: { mode: ThemeChoice }) {
  const isDark = mode === "dark";
  const split = mode === "system";
  return (
    <div className="relative h-[150px] overflow-hidden rounded-md border border-[hsl(var(--border))] bg-white shadow-inner">
      <div className="absolute inset-0 flex">
        <div
          className={`${split ? "w-1/2" : "w-full"} ${isDark ? "bg-[#171a2d]" : "bg-[#f7f8fb]"}`}
        />
        {split ? <div className="w-1/2 bg-[#171a2d]" /> : null}
      </div>
      <div className="relative z-10 flex h-full p-3">
        <div className={`w-[30%] rounded-md ${isDark ? "bg-[#222541]" : "bg-white"}`}>
          <div className="space-y-2 p-3">
            <div className={`h-2 w-12 rounded ${isDark ? "bg-[#3b3f61]" : "bg-[#dde1eb]"}`} />
            <div className="h-1.5 w-10 rounded bg-[hsl(var(--primary))]" />
            <div className={`h-1.5 w-12 rounded ${isDark ? "bg-[#343858]" : "bg-[#e7eaf1]"}`} />
            <div className={`h-1.5 w-9 rounded ${isDark ? "bg-[#343858]" : "bg-[#e7eaf1]"}`} />
          </div>
        </div>
        <div className="flex-1 space-y-3 p-3">
          <div
            className={`h-2 w-20 rounded ${isDark || split ? "bg-[#3d4160]" : "bg-[#dfe3ec]"}`}
          />
          <div className={`h-14 rounded-md ${isDark || split ? "bg-[#292d4d]" : "bg-white"}`}>
            <div className="space-y-2 p-3">
              <div
                className={`h-1.5 w-24 rounded ${isDark || split ? "bg-[#3a3e5d]" : "bg-[#e4e7ef]"}`}
              />
              <div
                className={`h-1.5 w-16 rounded ${isDark || split ? "bg-[#3a3e5d]" : "bg-[#e4e7ef]"}`}
              />
              <div className="h-2 w-10 rounded bg-[hsl(var(--primary))]" />
            </div>
          </div>
          <div className={`h-10 rounded-md ${isDark || split ? "bg-[#292d4d]" : "bg-white"}`} />
        </div>
      </div>
    </div>
  );
}
