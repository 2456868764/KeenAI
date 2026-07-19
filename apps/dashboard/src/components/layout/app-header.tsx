"use client";

export function AppHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4">
      <span className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </header>
  );
}
