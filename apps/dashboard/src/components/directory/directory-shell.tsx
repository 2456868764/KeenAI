"use client";

import { AppHeader } from "@/components/layout/app-header";
import { listMembers } from "@/lib/api";
import { Button } from "@keenai/ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Search, UserRound } from "lucide-react";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function planFor(role: string) {
  if (role === "owner") return "enterprise";
  if (role === "admin") return "growth";
  return "team";
}

function subscriptionFor(role: string) {
  if (role === "owner" || role === "admin") return "paid";
  return "trial";
}

export function DirectoryShell() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["directory-members"],
    queryFn: listMembers,
  });
  const members = data?.items ?? [];
  const activeCount = members.length;
  const newCount = Math.min(3, activeCount);

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))]">
      <AppHeader title="Directory" />

      <main className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
              People
            </p>
            <DirectoryNavItem label="All users" count={activeCount} active />
            <DirectoryNavItem label="All leads" count={0} />
            <DirectoryNavItem label="Active" count={activeCount} />
            <DirectoryNavItem label="New" count={newCount} />
          </section>

          <section className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
              Companies
            </p>
            <DirectoryNavItem label="All" count={Math.max(1, activeCount > 0 ? 1 : 0)} />
            <DirectoryNavItem label="Active" count={Math.max(1, activeCount > 0 ? 1 : 0)} />
            <DirectoryNavItem label="New" count={newCount > 0 ? 1 : 0} />
          </section>
        </aside>

        <section className="min-w-0 overflow-auto p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">All users ({activeCount})</h1>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Customer and teammate directory for support context.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Search users"
                className="inline-flex size-9 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
              >
                <Search className="size-4" />
              </button>
              <Button size="sm">
                <Plus className="mr-1 size-4" />
                Add users
              </Button>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 py-1 text-xs">
              Person tag
            </span>
            <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 py-1 text-xs text-[hsl(var(--muted-foreground))]">
              +5
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading users...</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error.message}</p>
          ) : (
            <div className="overflow-hidden border-y border-[hsl(var(--border))]">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[hsl(var(--surface-1))] text-xs uppercase text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="h-10 px-3 font-medium">Person</th>
                    <th className="h-10 px-3 font-medium">Email</th>
                    <th className="h-10 px-3 font-medium">Company</th>
                    <th className="h-10 px-3 font-medium">Subscription</th>
                    <th className="h-10 px-3 font-medium">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.id}
                      className="h-12 border-t border-[hsl(var(--border))] transition-colors hover:bg-[hsl(var(--surface-1))]"
                    >
                      <td className="px-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex size-8 items-center justify-center rounded-md bg-[hsl(var(--surface-2))] text-xs font-semibold text-[hsl(var(--primary))]">
                            {initials(member.name) || <UserRound className="size-4" />}
                          </span>
                          <span className="font-medium">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-3 text-[hsl(var(--muted-foreground))]">{member.email}</td>
                      <td className="px-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex size-6 items-center justify-center rounded bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
                            <Building2 className="size-3.5" />
                          </span>
                          KeenAI
                        </span>
                      </td>
                      <td className="px-3 text-[hsl(var(--muted-foreground))]">
                        {subscriptionFor(member.role)}
                      </td>
                      <td className="px-3 text-[hsl(var(--muted-foreground))]">
                        {planFor(member.role)}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="h-20 px-3 text-[hsl(var(--muted-foreground))]">
                        No users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function DirectoryNavItem({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? "mb-1 flex h-8 w-full items-center justify-between rounded-md bg-[hsl(var(--surface-2))] px-2 text-sm font-medium"
          : "mb-1 flex h-8 w-full items-center justify-between rounded-md px-2 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
      }
    >
      <span>{label}</span>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{count}</span>
    </button>
  );
}
