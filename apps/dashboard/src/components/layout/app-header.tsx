"use client";

import { clearAccessToken } from "@/lib/auth-store";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AppHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

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
            Inbox
          </NavLink>
          <NavLink href="/workflows" active={pathname.startsWith("/workflows")}>
            Workflows
          </NavLink>
          <NavLink href="/tickets" active={pathname.startsWith("/tickets")}>
            Tickets
          </NavLink>
          <NavLink href="/memory" active={pathname.startsWith("/memory")}>
            Memory
          </NavLink>
        </nav>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {children}
        <button
          type="button"
          onClick={() => {
            clearAccessToken();
            router.replace("/login");
          }}
          className="rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
        >
          Sign out
        </button>
      </div>
    </header>
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
