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
  FolderArchive,
  Globe2,
  HelpCircle,
  Inbox,
  Languages,
  LayoutGrid,
  Mail,
  Map as MapIcon,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Network,
  Palette,
  PenLine,
  Plus,
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
  count?: string | number;
  badge?: string;
  disabled?: boolean;
  expanded?: boolean;
  activeMatch?: (pathname: string, search: URLSearchParams) => boolean;
  children?: Omit<NavItem, "children">[];
};

function hasRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const modules: ProductModule[] = [
  {
    id: "inbox",
    title: "Inbox",
    href: "/inbox",
    icon: Inbox,
    match: (pathname) => hasRoutePrefix(pathname, "/inbox") || hasRoutePrefix(pathname, "/tickets"),
    sections: [
      {
        items: [
          {
            label: "My inbox",
            href: "/inbox?view=mine",
            icon: CirclePlus,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/inbox") && search.get("view") === "mine",
          },
          {
            label: "All messages",
            href: "/inbox?view=all",
            icon: Users,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/inbox") &&
              (!search.get("view") || search.get("view") === "all"),
          },
          {
            label: "Created by me",
            href: "/inbox?view=created",
            icon: PenLine,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/inbox") && search.get("view") === "created",
          },
          {
            label: "Unassigned",
            href: "/inbox?view=unassigned",
            icon: HelpCircle,
            activeMatch: (pathname, search) =>
              hasRoutePrefix(pathname, "/inbox") && search.get("view") === "unassigned",
          },
        ],
      },
      {
        title: "Views",
        actions: [{ icon: CirclePlus, label: "Create view", href: "/inbox?view=all" }],
        items: [],
      },
      {
        title: "Team inboxes",
        actions: [{ icon: CirclePlus, label: "Create team inbox", href: "/settings/brands" }],
        items: [],
      },
      {
        title: "AI Agent",
        items: [
          { label: "Resolved", href: "/inbox?view=resolved", icon: CircleCheck },
          { label: "Routed to human", href: "/inbox?view=routed", icon: Users },
        ],
      },
      {
        title: "Resources",
        items: [
          { label: "Tickets", href: "/tickets", icon: WalletCards },
          { label: "Help Center", href: "/help-center", icon: HelpCircle },
        ],
      },
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    href: "/feedback",
    icon: Box,
    match: (pathname) => hasRoutePrefix(pathname, "/feedback"),
    sections: [
      {
        title: "Statuses",
        items: [
          { label: "Under Review", href: "/feedback?status=under_review", icon: Circle },
          { label: "Planned", href: "/feedback?status=planned", icon: Circle },
          { label: "Active", href: "/feedback?status=active", icon: Circle },
          { label: "Done", href: "/feedback?status=done", icon: CircleCheck },
          { label: "Closed", href: "/feedback?status=closed", icon: CircleCheck },
          { label: "Reset all filters", href: "/feedback", icon: ChevronRight },
        ],
      },
      {
        title: "Quick Filters",
        items: [
          { label: "Boards", href: "/feedback", icon: Box, expanded: false },
          { label: "Tags", href: "/feedback", icon: Tag, expanded: false },
        ],
      },
      {
        title: "More",
        items: [
          { label: "AI Tools", href: "/custom-actions", icon: Sparkles, expanded: false },
          { label: "Analytics", href: "/analytics", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "roadmap",
    title: "Roadmap",
    href: "/roadmap",
    icon: MapIcon,
    match: (pathname) => hasRoutePrefix(pathname, "/roadmap"),
    sections: [
      { title: "Roadmaps", items: [{ label: "Main Roadmap", href: "/roadmap" }] },
      {
        title: "More",
        items: [{ label: "Create & Edit Roadmaps", href: "/roadmap", icon: CirclePlus }],
      },
    ],
  },
  {
    id: "help",
    title: "Origin",
    href: "/help-center",
    icon: BookOpen,
    match: (pathname) => hasRoutePrefix(pathname, "/help-center"),
    sections: [
      {
        title: "Content",
        items: [
          { label: "Collections", href: "/help-center", icon: Box },
          { label: "Articles", href: "/help-center", icon: BookOpen },
        ],
      },
      {
        title: "More",
        items: [
          { label: "Analytics", href: "/analytics", icon: BarChart3 },
          { label: "Importers", href: "/help-center", icon: Rocket },
        ],
      },
    ],
  },
  {
    id: "agent",
    title: "Keeni AI Agent",
    href: "/settings/personality",
    icon: LayoutGrid,
    match: (pathname) =>
      hasRoutePrefix(pathname, "/workflows") ||
      hasRoutePrefix(pathname, "/custom-actions") ||
      hasRoutePrefix(pathname, "/memory") ||
      hasRoutePrefix(pathname, "/knowledge-base") ||
      pathname === "/settings/personality",
    sections: [
      {
        title: "Keeni settings",
        items: [
          { label: "Personality & Branding", href: "/settings/personality", icon: Palette },
          { label: "Memory", href: "/memory", icon: Bot },
          { label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
          { label: "Actions", href: "/custom-actions", icon: Sparkles },
          { label: "Other", href: "/settings/brands", icon: Settings },
          { label: "Deploy", href: "/settings/channels", icon: Rocket },
        ],
      },
      {
        title: "Automations",
        items: [{ label: "Workflows", href: "/workflows", icon: Network }],
      },
    ],
  },
  {
    id: "directory",
    title: "Directory",
    href: "/directory",
    icon: Users,
    match: (pathname) => hasRoutePrefix(pathname, "/directory"),
    sections: [
      {
        items: [
          {
            label: "People",
            href: "/directory",
            icon: Users,
            expanded: true,
            children: [
              { label: "All users", href: "/directory", count: 0 },
              { label: "All leads", href: "/directory?view=leads", count: 0 },
            ],
          },
          {
            label: "Companies",
            href: "/directory?view=companies",
            icon: Building2,
            expanded: true,
            children: [{ label: "All", href: "/directory?view=companies", count: 0 }],
          },
        ],
      },
    ],
  },
  {
    id: "outbound",
    title: "Outbound",
    href: "/changelog",
    icon: Send,
    match: (pathname) => hasRoutePrefix(pathname, "/changelog"),
    sections: [
      {
        items: [
          { label: "Messages", href: "/changelog", icon: Send, count: 0 },
          { label: "Series", href: "/changelog", icon: Network, badge: "SOON", disabled: true },
        ],
      },
      {
        title: "Views",
        actions: [{ icon: CirclePlus, label: "Create view", href: "/changelog" }],
        items: [
          { label: "Chat", href: "/changelog?channel=chat", icon: MessageCircle, count: 0 },
          { label: "Banner", href: "/changelog?channel=banner", icon: MessageSquare, count: 0 },
          { label: "Email", href: "/changelog?channel=email", icon: Mail, count: 0 },
          { label: "Survey", href: "/changelog?channel=survey", icon: SlidersHorizontal, count: 0 },
          { label: "Update", href: "/changelog", icon: Megaphone, count: 0 },
        ],
      },
      {
        title: "More",
        items: [
          { label: "Subscriptions", href: "/changelog", icon: Mail },
          { label: "Customization", href: "/settings/brands", icon: SlidersHorizontal },
        ],
      },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    match: (pathname) => hasRoutePrefix(pathname, "/analytics"),
    sections: [
      {
        title: "Modules",
        items: [
          { label: "All Modules", href: "/analytics", icon: Globe2 },
          { label: "Support Module", href: "/analytics?module=support", icon: MessageSquare },
          { label: "Feedback", href: "/analytics?module=feedback", icon: Box },
          {
            label: "Updates",
            href: "/analytics?module=updates",
            icon: Megaphone,
            expanded: true,
            children: [
              { label: "Website Analytics", href: "/analytics?module=website" },
              { label: "Email Analytics", href: "/analytics?module=email" },
            ],
          },
          { label: "Surveys", href: "/analytics?module=surveys", icon: FolderArchive },
          { label: "Help Centers", href: "/analytics?module=help", icon: BookOpen },
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    href: "/settings/brands",
    icon: Settings,
    match: (pathname) => hasRoutePrefix(pathname, "/settings"),
    sections: [
      {
        title: "Personal",
        items: [
          { label: "Profile", href: "/settings/brands", icon: UserCircle },
          { label: "Notifications", href: "/settings/channels", icon: Bell },
        ],
      },
      {
        title: "Products",
        items: [
          { label: "Support", href: "/settings/sla", icon: Inbox, expanded: false },
          { label: "Feedback & Roadmaps", href: "/feedback", icon: Box, expanded: false },
          { label: "Help Centers", href: "/help-center", icon: BookOpen, expanded: false },
          { label: "Outbound", href: "/changelog", icon: Send, expanded: false },
        ],
      },
      {
        title: "Workspace",
        items: [
          { label: "General", href: "/settings/brands", icon: Wrench },
          { label: "Branding", href: "/settings/personality", icon: Palette },
          { label: "Members and teams", href: "/directory", icon: Users },
          { label: "Billing", href: "/settings/brands", icon: WalletCards },
          { label: "Emails", href: "/settings/channels", icon: Mail },
          { label: "Custom Domain", href: "/settings/brands", icon: Globe2 },
          { label: "Multilingual", href: "/settings/brands", icon: Languages },
          { label: "Access & Security", href: "/settings/brands", icon: Shield },
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

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))]">
      <IconRail
        activeModuleId={activeModule.id}
        onSignOut={() => {
          clearAccessToken();
          router.replace("/login");
        }}
      />
      <ModuleSidebar module={activeModule} pathname={pathname} searchParams={searchParams} />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function IconRail({
  activeModuleId,
  onSignOut,
}: {
  activeModuleId: string;
  onSignOut: () => void;
}) {
  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] py-3">
      <Link
        href="/inbox"
        aria-label="KeenAI home"
        className="mb-5 flex size-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-sm"
      >
        K
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-2">
        {modules.map((item) => {
          const Icon = item.icon;
          const active = activeModuleId === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.title}
              title={item.title}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl border text-[hsl(var(--muted-foreground))] transition-colors",
                active
                  ? "border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--primary))] shadow-sm"
                  : "border-transparent hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-2">
        <RailButton icon={Bell} label="Notifications" href="/settings/channels" />
        <RailButton icon={Settings} label="Settings" href="/settings/brands" />
        <button
          type="button"
          onClick={onSignOut}
          className="flex size-10 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          title="Sign out"
          aria-label="Sign out"
        >
          <ExternalLink className="size-5" />
        </button>
        <Link
          href="/inbox"
          aria-label="Create"
          title="Create"
          className="relative mt-1 flex size-12 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
        >
          <Plus className="size-7" />
          <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[hsl(var(--surface-1))] bg-emerald-500" />
        </Link>
      </div>
    </aside>
  );
}

function RailButton({ icon: Icon, label, href }: { icon: NavIcon; label: string; href: string }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
    >
      <Icon className="size-5" />
    </Link>
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
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
      <div className="flex h-20 items-center justify-between border-b border-[hsl(var(--border))] px-6">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          {module.title}
        </h1>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          aria-label={`Search ${module.title}`}
          title={`Search ${module.title}`}
        >
          <Search className="size-4" />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
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
        <div className="mb-2 flex items-center justify-between px-2">
          {section.title ? (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
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
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined ? (
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.count}</span>
      ) : null}
      {item.badge ? (
        <span className="rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
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
        <div className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[hsl(var(--muted-foreground)/0.55)]">
          {content}
        </div>
      ) : (
        <Link
          href={item.href}
          className={cn(
            "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
            active
              ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]"
              : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
          )}
        >
          {content}
        </Link>
      )}
      {item.children?.length && item.expanded ? (
        <div className="ml-5 mt-1 space-y-1 border-l border-[hsl(var(--border))] pl-3">
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
