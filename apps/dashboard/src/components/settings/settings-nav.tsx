"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/settings/brands", label: "Brands" },
  { href: "/settings/personality", label: "Personality" },
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/sla", label: "SLA" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-2 border-b border-[hsl(var(--border))] pb-2">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-[hsl(var(--surface-2))] font-medium text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
