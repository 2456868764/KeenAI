"use client";

import { type AppLocale, getStoredLocale, setStoredLocale } from "@/i18n/locale-store";
import { clearAccessToken } from "@/lib/auth-store";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AppHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tLocale = useTranslations("locale");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded bg-[hsl(var(--primary))] text-[10px] font-bold text-[hsl(var(--primary-foreground))]">
            K
          </span>
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</span>
        </div>
        <nav className="flex items-center gap-1 text-xs">
          <NavLink href="/inbox" active={pathname.startsWith("/inbox")}>
            {t("inbox")}
          </NavLink>
          <NavLink href="/workflows" active={pathname.startsWith("/workflows")}>
            {t("workflows")}
          </NavLink>
          <NavLink href="/tickets" active={pathname.startsWith("/tickets")}>
            {t("tickets")}
          </NavLink>
          <NavLink href="/memory" active={pathname.startsWith("/memory")}>
            {t("memory")}
          </NavLink>
          <NavLink href="/custom-actions" active={pathname.startsWith("/custom-actions")}>
            {t("actions")}
          </NavLink>
          <NavLink href="/help-center" active={pathname.startsWith("/help-center")}>
            {t("help")}
          </NavLink>
          <NavLink href="/settings/brands" active={pathname.startsWith("/settings")}>
            {t("settings")}
          </NavLink>
        </nav>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {children}
        <LocaleSwitcher labels={{ en: tLocale("en"), zh: tLocale("zh") }} />
        <button
          type="button"
          onClick={() => {
            clearAccessToken();
            router.replace("/login");
          }}
          className="rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
        >
          {t("signOut")}
        </button>
      </div>
    </header>
  );
}

function LocaleSwitcher({ labels }: { labels: Record<AppLocale, string> }) {
  const [locale, setLocale] = useState<AppLocale>("en");

  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  return (
    <select
      className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-2 py-1 text-xs text-[hsl(var(--foreground))]"
      value={locale}
      onChange={(e) => {
        const next = e.target.value as AppLocale;
        setStoredLocale(next);
        window.location.reload();
      }}
    >
      <option value="en">{labels.en}</option>
      <option value="zh">{labels.zh}</option>
    </select>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md bg-[hsl(var(--surface-2))] px-2 py-1 font-medium text-[hsl(var(--foreground))]"
          : "rounded-md px-2 py-1 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
      }
    >
      {children}
    </Link>
  );
}
