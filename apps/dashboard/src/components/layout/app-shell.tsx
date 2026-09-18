"use client";

import {
  type AppLocale,
  SUPPORTED_LOCALES,
  getStoredLocale,
  setStoredLocale,
} from "@/i18n/locale-store";
import { clearAccessToken } from "@/lib/auth-store";
import { cn } from "@keenai/ui";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CirclePlus,
  ExternalLink,
  Eye,
  FolderArchive,
  Globe2,
  HelpCircle,
  Inbox,
  Languages,
  LayoutGrid,
  ListChecks,
  LogOut,
  Mail,
  Map as MapIcon,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Moon,
  Network,
  Palette,
  Paperclip,
  PenLine,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Tag,
  UserCircle,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type NavIcon = typeof Inbox;

type ProductModule = {
  id: string;
  title: string;
  href: string;
  icon: NavIcon;
  hideInRail?: boolean;
  match: (pathname: string) => boolean;
  sections: NavSection[];
};

type NavSection = {
  title?: string;
  actions?: NavSectionAction[];
  items: NavItem[];
};

type NavSectionAction = {
  icon: NavIcon;
  label: string;
  href: string;
};

type NavItem = {
  label: string;
  href: string;
  icon?: NavIcon;
  iconClassName?: string;
  count?: string | number;
  badge?: string;
  disabled?: boolean;
  expanded?: boolean;
  activeMatch?: (pathname: string, search: URLSearchParams) => boolean;
  children?: Omit<NavItem, "children">[];
};

type ThemeChoice = "light" | "dark";

const THEME_STORAGE_KEY = "keenai_dashboard_theme";

function hasRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function applyDashboardTheme(choice: ThemeChoice) {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.theme = choice;
}

function isWorkflowEditorRoute(pathname: string): boolean {
  return /^\/dashboard\/agent\/workflows\/[^/]+$/.test(pathname);
}

const modules: ProductModule[] = [
  {
    id: "inbox",
    title: "Inbox",
    href: "/dashboard/inbox",
    icon: Inbox,
    match: (pathname) =>
      hasRoutePrefix(pathname, "/dashboard/inbox") ||
      hasRoutePrefix(pathname, "/dashboard/tickets"),
    sections: [
      {
        items: [
          {
            label: "My inbox",
            href: "/dashboard/inbox?view=mine",
            icon: CirclePlus,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/dashboard/inbox") && search.get("view") === "mine",
          },
          {
            label: "All messages",
            href: "/dashboard/inbox?view=all",
            icon: Users,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/dashboard/inbox") &&
              (!search.get("view") || search.get("view") === "all"),
          },
          {
            label: "Created by me",
            href: "/dashboard/inbox?view=created",
            icon: PenLine,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/dashboard/inbox") && search.get("view") === "created",
          },
          {
            label: "Unassigned",
            href: "/dashboard/inbox?view=unassigned",
            icon: HelpCircle,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/dashboard/inbox") && search.get("view") === "unassigned",
          },
        ],
      },
      {
        title: "Views",
        actions: [{ icon: CirclePlus, label: "Create view", href: "/dashboard/inbox?view=all" }],
        items: [],
      },
      {
        title: "Team inboxes",
        actions: [
          { icon: CirclePlus, label: "Create team inbox", href: "/dashboard/settings/brands" },
        ],
        items: [],
      },
      {
        title: "AI Agent",
        items: [
          { label: "Resolved", href: "/dashboard/inbox?view=resolved", icon: CircleCheck },
          { label: "Routed to human", href: "/dashboard/inbox?view=routed", icon: Users },
        ],
      },
      {
        title: "Resources",
        items: [
          { label: "Tickets", href: "/dashboard/tickets", icon: WalletCards },
          { label: "Help Center", href: "/dashboard/help-center", icon: HelpCircle },
        ],
      },
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    href: "/dashboard/feedback",
    icon: Box,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/feedback"),
    sections: [
      {
        title: "Statuses",
        items: [
          {
            label: "Under Review",
            href: "/dashboard/feedback?status=under_review",
            icon: Circle,
            iconClassName: "text-slate-400",
          },
          {
            label: "Planned",
            href: "/dashboard/feedback?status=planned",
            icon: Circle,
            iconClassName: "text-purple-300",
          },
          {
            label: "Active",
            href: "/dashboard/feedback?status=active",
            icon: Circle,
            iconClassName: "text-sky-500",
          },
          {
            label: "Done",
            href: "/dashboard/feedback?status=done",
            icon: CircleCheck,
            iconClassName: "text-emerald-500",
          },
          {
            label: "Closed",
            href: "/dashboard/feedback?status=closed",
            icon: CircleCheck,
            iconClassName: "text-slate-400",
          },
        ],
      },
      {
        title: "Quick Filters",
        items: [
          { label: "Boards", href: "/dashboard/feedback", icon: Box, expanded: false },
          { label: "Tags", href: "/dashboard/feedback", icon: Tag, expanded: false },
        ],
      },
      {
        title: "More",
        items: [
          {
            label: "AI Tools",
            href: "/dashboard/agent/custom-actions",
            icon: Sparkles,
            expanded: false,
          },
          { label: "Analytics", href: "/dashboard/analytics?module=feedback", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "roadmap",
    title: "Roadmap",
    href: "/dashboard/roadmap",
    icon: MapIcon,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/roadmap"),
    sections: [
      { title: "Roadmaps", items: [{ label: "Main Roadmap", href: "/dashboard/roadmap" }] },
      {
        title: "More",
        items: [{ label: "Create & Edit Roadmaps", href: "/dashboard/roadmap", icon: CirclePlus }],
      },
    ],
  },
  {
    id: "help",
    title: "Origin",
    href: "/dashboard/help-center",
    icon: BookOpen,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/help-center"),
    sections: [
      {
        title: "Content",
        items: [
          { label: "Collections", href: "/dashboard/help-center", icon: Box },
          { label: "Articles", href: "/dashboard/help-center", icon: BookOpen },
        ],
      },
      {
        title: "More",
        items: [
          { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
          { label: "Importers", href: "/dashboard/help-center", icon: Rocket },
        ],
      },
    ],
  },
  {
    id: "agent",
    title: "Keeni AI Agent",
    href: "/dashboard/agent/personality",
    icon: LayoutGrid,
    match: (pathname) =>
      hasRoutePrefix(pathname, "/dashboard/agent/workflows") ||
      hasRoutePrefix(pathname, "/dashboard/agent/custom-actions") ||
      hasRoutePrefix(pathname, "/dashboard/agent/memory") ||
      hasRoutePrefix(pathname, "/dashboard/agent/knowledge-base") ||
      hasRoutePrefix(pathname, "/dashboard/agent/agent-runs") ||
      pathname === "/dashboard/agent/personality" ||
      pathname === "/dashboard/agent/agent-other" ||
      pathname === "/dashboard/agent/deploy",
    sections: [
      {
        title: "Keeni settings",
        items: [
          {
            label: "Personality & Branding",
            href: "/dashboard/agent/personality",
            icon: Palette,
          },
          { label: "Memory", href: "/dashboard/agent/memory", icon: Bot },
          { label: "Knowledge Base", href: "/dashboard/agent/knowledge-base", icon: BookOpen },
          { label: "Actions", href: "/dashboard/agent/custom-actions", icon: Sparkles },
          { label: "Run Trace", href: "/dashboard/agent/agent-runs", icon: ListChecks },
          { label: "Other", href: "/dashboard/agent/agent-other", icon: Settings },
          { label: "Deploy", href: "/dashboard/agent/deploy", icon: Rocket },
        ],
      },
      {
        title: "Automations",
        items: [{ label: "Workflows", href: "/dashboard/agent/workflows", icon: Network }],
      },
    ],
  },
  {
    id: "directory",
    title: "Directory",
    href: "/dashboard/directory",
    icon: Users,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/directory"),
    sections: [
      {
        items: [
          {
            label: "People",
            href: "/dashboard/directory",
            icon: Users,
            expanded: true,
            children: [
              { label: "All users", href: "/dashboard/directory", count: 0 },
              { label: "All leads", href: "/dashboard/directory?view=leads", count: 0 },
            ],
          },
          {
            label: "Companies",
            href: "/dashboard/directory?view=companies",
            icon: Building2,
            expanded: true,
            children: [{ label: "All", href: "/dashboard/directory?view=companies", count: 0 }],
          },
        ],
      },
    ],
  },
  {
    id: "outbound",
    title: "Outbound",
    href: "/dashboard/changelog",
    icon: Send,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/changelog"),
    sections: [
      {
        items: [
          { label: "Messages", href: "/dashboard/changelog", icon: Send, count: 0 },
          {
            label: "Series",
            href: "/dashboard/changelog",
            icon: Network,
            badge: "SOON",
            disabled: true,
          },
        ],
      },
      {
        title: "Views",
        actions: [{ icon: CirclePlus, label: "Create view", href: "/dashboard/changelog" }],
        items: [
          {
            label: "Chat",
            href: "/dashboard/changelog?channel=chat",
            icon: MessageCircle,
            count: 0,
          },
          {
            label: "Banner",
            href: "/dashboard/changelog?channel=banner",
            icon: MessageSquare,
            count: 0,
          },
          { label: "Email", href: "/dashboard/changelog?channel=email", icon: Mail, count: 0 },
          {
            label: "Survey",
            href: "/dashboard/changelog?channel=survey",
            icon: SlidersHorizontal,
            count: 0,
          },
          { label: "Update", href: "/dashboard/changelog", icon: Megaphone, count: 0 },
        ],
      },
      {
        title: "More",
        items: [
          { label: "Subscriptions", href: "/dashboard/changelog", icon: Mail },
          { label: "Customization", href: "/dashboard/settings/brands", icon: SlidersHorizontal },
        ],
      },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/analytics"),
    sections: [
      {
        title: "Modules",
        items: [
          { label: "All Modules", href: "/dashboard/analytics", icon: Globe2 },
          {
            label: "Support Module",
            href: "/dashboard/analytics?module=support",
            icon: MessageSquare,
          },
          { label: "Feedback", href: "/dashboard/analytics?module=feedback", icon: Box },
          {
            label: "Updates",
            href: "/dashboard/analytics?module=updates",
            icon: Megaphone,
            expanded: true,
            children: [
              { label: "Website Analytics", href: "/dashboard/analytics?module=website" },
              { label: "Email Analytics", href: "/dashboard/analytics?module=email" },
            ],
          },
          { label: "Surveys", href: "/dashboard/analytics?module=surveys", icon: FolderArchive },
          { label: "Help Centers", href: "/dashboard/analytics?module=help", icon: BookOpen },
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    href: "/dashboard/settings/profile",
    icon: Settings,
    hideInRail: true,
    match: (pathname) => hasRoutePrefix(pathname, "/dashboard/settings"),
    sections: [
      {
        title: "Personal",
        items: [
          { label: "Profile", href: "/dashboard/settings/profile", icon: UserCircle },
          { label: "Notifications", href: "/dashboard/settings/notifications", icon: Bell },
        ],
      },
      {
        title: "Products",
        items: [
          { label: "Support", href: "/dashboard/settings/sla", icon: Inbox, expanded: false },
          { label: "Feedback & Roadmaps", href: "/dashboard/feedback", icon: Box, expanded: false },
          {
            label: "Help Centers",
            href: "/dashboard/help-center",
            icon: BookOpen,
            expanded: false,
          },
          { label: "Outbound", href: "/dashboard/changelog", icon: Send, expanded: false },
        ],
      },
      {
        title: "Workspace",
        items: [
          { label: "General", href: "/dashboard/settings/brands", icon: Wrench },
          { label: "Branding", href: "/dashboard/settings/branding", icon: Palette },
          { label: "Members and teams", href: "/dashboard/directory", icon: Users },
          { label: "Billing", href: "/dashboard/settings/brands", icon: WalletCards },
          { label: "Emails", href: "/dashboard/settings/emails", icon: Mail },
          { label: "Custom Domain", href: "/dashboard/settings/brands", icon: Globe2 },
          { label: "Multilingual", href: "/dashboard/settings/brands", icon: Languages },
          { label: "Access & Security", href: "/dashboard/settings/brands", icon: Shield },
          { label: "MCP", href: "/dashboard/settings/mcp", icon: Paperclip, badge: "NEW" },
          { label: "Integrations", href: "/dashboard/settings/integrations", icon: LayoutGrid },
        ],
      },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={children}>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fallbackModule = modules[0];
  if (!fallbackModule) throw new Error("dashboard_modules_missing");
  const activeModule = useMemo<ProductModule>(
    () => modules.find((item) => item.match(pathname)) ?? fallbackModule,
    [pathname, fallbackModule],
  );
  const hideModuleSidebar = isWorkflowEditorRoute(pathname);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))]">
      <IconRail
        activeModuleId={activeModule.id}
        pathname={pathname}
        onSignOut={() => {
          clearAccessToken();
          router.replace("/login");
        }}
      />
      {hideModuleSidebar ? null : (
        <ModuleSidebar module={activeModule} pathname={pathname} searchParams={searchParams} />
      )}
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function IconRail({
  activeModuleId,
  pathname,
  onSignOut,
}: {
  activeModuleId: string;
  pathname: string;
  onSignOut: () => void;
}) {
  const railModules = modules.filter((item) => !item.hideInRail);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<NotificationTab>("all");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [awayMode, setAwayMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    const choice: ThemeChoice = stored === "dark" ? "dark" : "light";
    setDarkMode(choice === "dark");
    applyDashboardTheme(choice);
  }, []);

  function toggleDarkMode() {
    const nextDarkMode = !darkMode;
    const nextTheme: ThemeChoice = nextDarkMode ? "dark" : "light";
    setDarkMode(nextDarkMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyDashboardTheme(nextTheme);
  }

  return (
    <aside className="relative flex w-[72px] shrink-0 flex-col items-center border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] py-3">
      <Link
        href="/dashboard/inbox"
        aria-label="KeenAI home"
        className="group relative mb-5 flex size-10 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] shadow-sm ring-1 ring-[hsl(var(--border))]"
      >
        <img src="/icon.png" alt="" className="size-8" />
        <RailTooltip label="Home" />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-2">
        {railModules.map((item) => {
          const Icon = item.icon;
          const active = activeModuleId === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.title}
              className={cn(
                "group relative flex size-10 items-center justify-center rounded-xl border text-[hsl(var(--muted-foreground))] transition-colors",
                active
                  ? "border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--primary))] shadow-sm"
                  : "border-transparent hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              <Icon className="size-5" />
              <RailTooltip label={item.title} />
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-2">
        <RailActionButton
          icon={Bell}
          label="Notifications"
          active={notificationsOpen}
          onClick={() => {
            setAccountMenuOpen(false);
            setNotificationsOpen((open) => !open);
          }}
        />
        <RailButton
          icon={Settings}
          label="Settings"
          href="/dashboard/settings/profile"
          active={activeModuleId === "settings" && pathname !== "/dashboard/settings/notifications"}
        />
        <button
          type="button"
          aria-label="Account menu"
          onClick={() => {
            setNotificationsOpen(false);
            setAccountMenuOpen((open) => !open);
          }}
          className={cn(
            "group relative mt-1 flex size-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm transition-transform hover:scale-[1.02]",
            accountMenuOpen &&
              "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-1))]",
          )}
        >
          <img src="/icon.png" alt="" className="size-6 brightness-0 invert" />
          <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[hsl(var(--surface-1))] bg-emerald-500" />
          <RailTooltip label="Account" />
        </button>
      </div>
      {notificationsOpen ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-y-0 left-[72px] right-0 z-30 cursor-default bg-transparent"
            onClick={() => setNotificationsOpen(false)}
          />
          <NotificationsPopover activeTab={notificationTab} onTabChange={setNotificationTab} />
        </>
      ) : null}
      {accountMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setAccountMenuOpen(false)}
          />
          <AccountMenuPopover
            awayMode={awayMode}
            darkMode={darkMode}
            onAwayModeChange={() => setAwayMode((enabled) => !enabled)}
            onDarkModeChange={toggleDarkMode}
            onNavigate={() => setAccountMenuOpen(false)}
            onSignOut={onSignOut}
          />
        </>
      ) : null}
    </aside>
  );
}

type NotificationTab = "all" | "comments" | "posts" | "assignments" | "mentions";

const notificationTabs: Array<{ id: NotificationTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "comments", label: "Comments" },
  { id: "posts", label: "Posts" },
  { id: "assignments", label: "Assignments" },
  { id: "mentions", label: "Mentions" },
];

function AccountMenuPopover({
  awayMode,
  darkMode,
  onAwayModeChange,
  onDarkModeChange,
  onNavigate,
  onSignOut,
}: {
  awayMode: boolean;
  darkMode: boolean;
  onAwayModeChange: () => void;
  onDarkModeChange: () => void;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  return (
    <section
      className="fixed bottom-2 left-[72px] z-50 w-[255px] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[13px] font-semibold text-[hsl(var(--muted-foreground))] shadow-2xl"
      aria-label="Account menu"
    >
      <div className="border-b border-[hsl(var(--border))]">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))]"
        >
          <Rocket className="size-4" />
          <span>We're hiring ✨</span>
        </button>
      </div>

      <div className="border-b border-[hsl(var(--border))]">
        <button
          type="button"
          onClick={onAwayModeChange}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] transition-colors hover:bg-[hsl(var(--surface-2))]"
        >
          <span>Away mode</span>
          <span
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              awayMode ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-2))]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
                awayMode ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </div>

      <div className="p-1.5">
        <AccountMenuLink
          href="/dashboard/settings/profile"
          icon={UserCircle}
          label="My Profile"
          onNavigate={onNavigate}
        />
        <AccountMenuLink
          href="/dashboard/settings/notifications"
          icon={Bell}
          label="Notification preferences"
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={onDarkModeChange}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--surface-2))]"
        >
          <Moon className="size-4" />
          <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
        </button>
        <AccountMenuLink
          href="/dashboard/settings/brands"
          icon={Building2}
          label="My Organizations"
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={() => {
            onNavigate();
            onSignOut();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--surface-2))]"
        >
          <LogOut className="size-4" />
          <span>Sign out</span>
        </button>
      </div>
    </section>
  );
}

function AccountMenuLink({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: NavIcon;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[hsl(var(--surface-2))]"
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

function RailButton({
  icon: Icon,
  label,
  href,
  active,
}: {
  icon: NavIcon;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "group relative flex size-10 items-center justify-center rounded-xl border text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
        active
          ? "border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--primary))] shadow-sm"
          : "border-transparent",
      )}
    >
      <Icon className="size-5" />
      <RailTooltip label={label} />
    </Link>
  );
}

function RailActionButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: NavIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "group relative flex size-10 items-center justify-center rounded-xl border text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
        active
          ? "border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--primary))] shadow-sm"
          : "border-transparent",
      )}
    >
      <Icon className="size-5" />
      <RailTooltip label={label} />
    </button>
  );
}

function RailTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+4px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function NotificationsPopover({
  activeTab,
  onTabChange,
}: {
  activeTab: NotificationTab;
  onTabChange: (tab: NotificationTab) => void;
}) {
  return (
    <section
      className="fixed bottom-[10vh] left-[72px] top-[10vh] z-40 flex w-[min(570px,calc(100vw-88px))] flex-col overflow-hidden rounded-r-2xl border border-l-0 border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-sm shadow-2xl"
      aria-label="Notifications inbox"
    >
      <header className="border-b border-[hsl(var(--border))] px-6 py-5">
        <h2 className="text-lg font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Inbox
        </h2>
      </header>
      <div className="flex items-end justify-between border-b border-[hsl(var(--border))] px-6">
        <nav className="flex min-w-0 items-end gap-5" aria-label="Notification views">
          {notificationTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "relative h-12 whitespace-nowrap text-sm font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]",
                  active && "text-[hsl(var(--foreground))]",
                )}
              >
                {tab.label}
                {active ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[hsl(var(--primary))]" />
                ) : null}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          className="mb-3 flex size-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          aria-label="Mark all notifications as seen"
          title="Mark all notifications as seen"
        >
          <Eye className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-14 text-center">
        <div className="relative h-28 w-80 max-w-full">
          <div className="absolute left-8 top-3 flex h-16 w-64 items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 shadow-lg">
            <span className="flex size-11 items-center justify-center rounded-full border-4 border-blue-200 bg-[hsl(var(--surface-2))]" />
            <span className="space-y-3">
              <span className="block h-3 w-44 rounded-full bg-[hsl(var(--surface-2))]" />
              <span className="block h-3 w-28 rounded-full bg-[hsl(var(--surface-2))]" />
            </span>
          </div>
          <div className="absolute bottom-0 right-5 flex h-16 w-64 items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 shadow-lg">
            <span className="flex size-11 items-center justify-center rounded-full border-4 border-rose-200 bg-[hsl(var(--surface-2))]" />
            <span className="space-y-3">
              <span className="block h-3 w-44 rounded-full bg-[hsl(var(--surface-2))]" />
              <span className="block h-3 w-28 rounded-full bg-[hsl(var(--surface-2))]" />
            </span>
          </div>
        </div>
        <p className="mt-7 text-base font-semibold text-[hsl(var(--muted-foreground))]">
          You're all caught up!
        </p>
      </div>
    </section>
  );
}

function ModuleSidebar({
  module,
  pathname,
  searchParams,
}: {
  module: ProductModule;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  const HeaderActionIcon = module.id === "feedback" ? ExternalLink : Search;
  const headerActionLabel =
    module.id === "feedback" ? "Open feedback portal" : `Search ${module.title}`;

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
      <div className="flex h-16 items-center justify-between border-b border-[hsl(var(--border))] px-4">
        <h1 className="truncate text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          {module.title}
        </h1>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          aria-label={headerActionLabel}
          title={headerActionLabel}
        >
          <HeaderActionIcon className="size-4" />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {module.sections.map((section, index) => (
          <NavSectionView
            key={`${module.id}-${section.title ?? index}`}
            section={section}
            pathname={pathname}
            searchParams={searchParams}
          />
        ))}
      </nav>
      <LocaleSwitcher />
    </aside>
  );
}

function NavSectionView({
  section,
  pathname,
  searchParams,
}: {
  section: NavSection;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  return (
    <section className="mb-5 last:mb-0">
      {section.title || section.actions?.length ? (
        <div className="mb-2 flex items-center justify-between px-1.5">
          {section.title ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              {section.title}
            </h2>
          ) : (
            <span />
          )}
          {section.actions?.length ? (
            <div className="flex items-center gap-1">
              {section.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    aria-label={action.label}
                    title={action.label}
                    className="flex size-6 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
                  >
                    <Icon className="size-4" />
                  </Link>
                );
              })}
              <ChevronRight className="size-4 text-[hsl(var(--muted-foreground))]" />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-1">
        {section.items.map((item) => (
          <NavItemView
            key={`${item.href}-${item.label}`}
            item={item}
            pathname={pathname}
            searchParams={searchParams}
          />
        ))}
      </div>
    </section>
  );
}

function NavItemView({
  item,
  pathname,
  searchParams,
}: {
  item: NavItem;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  const Icon = item.icon;
  const active = isItemActive(item, pathname, searchParams);
  const content = (
    <>
      {Icon ? <Icon className={cn("size-4 shrink-0", item.iconClassName)} /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined ? (
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.count}</span>
      ) : null}
      {item.badge ? (
        <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
          {item.badge}
        </span>
      ) : null}
      {item.expanded !== undefined ? (
        item.expanded ? (
          <ChevronDown className="size-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
        )
      ) : null}
    </>
  );

  return (
    <div>
      {item.disabled ? (
        <div className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-[hsl(var(--muted-foreground)/0.55)]">
          {content}
        </div>
      ) : (
        <Link
          href={item.href}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors",
            active
              ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]"
              : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
          )}
        >
          {content}
        </Link>
      )}
      {item.children?.length && item.expanded ? (
        <div className="ml-4 mt-1 space-y-1 border-l border-[hsl(var(--border))] pl-2.5">
          {item.children.map((child) => (
            <NavItemView
              key={`${child.href}-${child.label}`}
              item={child}
              pathname={pathname}
              searchParams={searchParams}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isItemActive(item: NavItem, pathname: string, searchParams: URLSearchParams): boolean {
  if (item.activeMatch) return item.activeMatch(pathname, searchParams);
  const [itemPath, query] = item.href.split("?");
  if (!itemPath || !hasRoutePrefix(pathname, itemPath)) return false;
  if (!query) return pathname === itemPath;
  const expected = new URLSearchParams(query);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

function LocaleSwitcher() {
  const [locale, setLocale] = useState<AppLocale>("en");

  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  return (
    <div className="border-t border-[hsl(var(--border))] p-4">
      <select
        className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs text-[hsl(var(--foreground))]"
        value={locale}
        onChange={(e) => {
          const next = e.target.value as AppLocale;
          setStoredLocale(next);
          window.location.reload();
        }}
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item} value={item}>
            {item.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
