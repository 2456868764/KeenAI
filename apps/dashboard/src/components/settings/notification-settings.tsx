"use client";

import { cn } from "@keenai/ui";
import {
  Archive,
  BellRing,
  Inbox,
  Laptop,
  Mail,
  Megaphone,
  MessageSquare,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

type NotificationTab = "support" | "feedback" | "updates";
type Channel = "desktop" | "email" | "mobile";

type MatrixRow = {
  label: string;
  enabled: Record<Channel, boolean>;
};

type FeedbackRow = {
  title: string;
  description: string;
  enabled: boolean;
};

const tabs: Array<{ id: NotificationTab; label: string; icon: LucideIcon }> = [
  { id: "support", label: "Support", icon: Inbox },
  { id: "feedback", label: "Feedback", icon: Archive },
  { id: "updates", label: "Updates", icon: Megaphone },
];

const initialSupportRows: MatrixRow[] = [
  {
    label: "Activity from all unassigned conversations",
    enabled: { desktop: true, email: false, mobile: true },
  },
  {
    label: "Activity for conversations assigned to you",
    enabled: { desktop: true, email: true, mobile: true },
  },
  {
    label: "Activity from your team conversations",
    enabled: { desktop: true, email: false, mobile: false },
  },
  {
    label: "Activity from conversations assigned to other teams/teammates",
    enabled: { desktop: false, email: false, mobile: false },
  },
  {
    label: "When you are mentioned in conversations",
    enabled: { desktop: true, email: true, mobile: true },
  },
  {
    label: "Activity on conversations you started",
    enabled: { desktop: true, email: true, mobile: true },
  },
  {
    label: "Ticket status changes",
    enabled: { desktop: true, email: true, mobile: true },
  },
  {
    label: "SLA breaches on conversations assigned to you",
    enabled: { desktop: true, email: false, mobile: true },
  },
];

const initialFeedbackRows: FeedbackRow[] = [
  {
    title: "Post updates",
    description: "Get notifications on post status change.",
    enabled: true,
  },
  {
    title: "Comment on post",
    description: "Get notified when your post has a new comment.",
    enabled: true,
  },
  {
    title: "Comment replies",
    description: "Get notified when a comment you made has a new reply.",
    enabled: true,
  },
  {
    title: "New Posts",
    description: "Get notifications each time a new post is made on the feedback board.",
    enabled: true,
  },
  {
    title: "Notify about comments not directed at me",
    description:
      "When enabled, all comments on posts will trigger a notification in your inbox - even when they are not directed at you.",
    enabled: true,
  },
];

export function NotificationSettings() {
  const [activeTab, setActiveTab] = useState<NotificationTab>("support");
  const [supportRows, setSupportRows] = useState(initialSupportRows);
  const [feedbackRows, setFeedbackRows] = useState(initialFeedbackRows);
  const [changelogEnabled, setChangelogEnabled] = useState(true);

  const activeContent = useMemo(() => {
    if (activeTab === "support") {
      return (
        <>
          <SupportTable rows={supportRows} onToggle={toggleSupportChannel} />
          <ChannelLegend />
        </>
      );
    }
    if (activeTab === "feedback") {
      return <FeedbackSettings rows={feedbackRows} onToggle={toggleFeedbackRow} />;
    }
    return (
      <SingleSettingCard
        title="Changelog"
        description="Get notified when a new changelog is released."
        checked={changelogEnabled}
        onToggle={() => setChangelogEnabled((enabled) => !enabled)}
      />
    );

    function toggleSupportChannel(rowIndex: number, channel: Channel) {
      setSupportRows((rows) =>
        rows.map((row, index) =>
          index === rowIndex
            ? { ...row, enabled: { ...row.enabled, [channel]: !row.enabled[channel] } }
            : row,
        ),
      );
    }

    function toggleFeedbackRow(rowIndex: number) {
      setFeedbackRows((rows) =>
        rows.map((row, index) => (index === rowIndex ? { ...row, enabled: !row.enabled } : row)),
      );
    }
  }, [activeTab, changelogEnabled, feedbackRows, supportRows]);

  return (
    <main className="flex-1 overflow-y-auto bg-[hsl(var(--surface-0))]">
      <div className="mx-auto w-full max-w-[900px] px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Notifications
          </h1>
          <p className="mt-3 text-lg text-[hsl(var(--muted-foreground))]">
            Change what notifications you receive from KeenAI.
          </p>
        </div>

        <div
          className="mb-9 inline-flex rounded-[22px] bg-[hsl(var(--surface-2))] p-1"
          role="tablist"
          aria-label="Notification categories"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-[18px] px-5 text-lg font-semibold transition-colors",
                  active
                    ? "bg-[hsl(var(--surface-1))] text-[hsl(var(--foreground))] shadow-sm ring-1 ring-[hsl(var(--border))]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="size-5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeContent}
      </div>
    </main>
  );
}

function SupportTable({
  rows,
  onToggle,
}: {
  rows: MatrixRow[];
  onToggle: (rowIndex: number, channel: Channel) => void;
}) {
  const columns: Array<{ id: Channel; label: string }> = [
    { id: "desktop", label: "Desktop" },
    { id: "email", label: "Email" },
    { id: "mobile", label: "Mobile" },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
      <div className="grid grid-cols-[minmax(320px,1fr)_120px_120px_120px] items-center border-b border-[hsl(var(--border))] px-6 py-5 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
        <span>Notify me about</span>
        {columns.map((column) => (
          <span key={column.id} className="text-center">
            {column.label}
          </span>
        ))}
      </div>
      <div>
        {rows.map((row, rowIndex) => (
          <div
            key={row.label}
            className="grid min-h-[76px] grid-cols-[minmax(320px,1fr)_120px_120px_120px] items-center border-b border-[hsl(var(--border))] px-6 last:border-b-0"
          >
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{row.label}</h2>
            {columns.map((column) => (
              <div key={column.id} className="flex justify-center">
                <Toggle
                  checked={row.enabled[column.id]}
                  onClick={() => onToggle(rowIndex, column.id)}
                  label={`${row.label} ${column.label}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function FeedbackSettings({
  rows,
  onToggle,
}: {
  rows: FeedbackRow[];
  onToggle: (rowIndex: number) => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
        <Mail className="size-4" />
        <span>Email notifications</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
        {rows.map((row, index) => (
          <SettingRow
            key={row.title}
            title={row.title}
            description={row.description}
            checked={row.enabled}
            onToggle={() => onToggle(index)}
          />
        ))}
      </div>
    </section>
  );
}

function SingleSettingCard({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
      <SettingRow title={title} description={description} checked={checked} onToggle={onToggle} />
    </section>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[94px] items-center gap-6 border-b border-[hsl(var(--border))] px-6 py-5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h2>
        <p className="mt-1 text-base text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      <Toggle checked={checked} onClick={onToggle} label={title} />
    </div>
  );
}

function ChannelLegend() {
  const items = [
    {
      icon: Laptop,
      title: "Desktop",
      description: "A banner in the corner of your screen.",
    },
    {
      icon: Mail,
      title: "Email",
      description: "Conversations sent to your inbox.",
    },
    {
      icon: Smartphone,
      title: "Mobile",
      description: "Push notifications on your phone.",
    },
  ];

  return (
    <section className="mt-6 grid gap-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-7 py-6 shadow-sm md:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.title} className="flex gap-4">
            <Icon className="mt-1 size-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{item.title}</h2>
              <p className="mt-1 text-base leading-snug text-[hsl(var(--muted-foreground))]">
                {item.description}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Toggle({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-2))]",
      )}
    >
      <span
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
