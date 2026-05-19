import { cn } from "@keenai/ui";

export function Alert({
  variant = "danger",
  children,
  className,
}: {
  variant?: "danger" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        variant === "danger" &&
          "border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.12)] text-[hsl(0_0%_96%)]",
        variant === "info" &&
          "border-[hsl(var(--info)/0.35)] bg-[hsl(var(--info)/0.12)] text-[hsl(var(--foreground))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
