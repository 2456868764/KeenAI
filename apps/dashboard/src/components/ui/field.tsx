import { Input, cn } from "@keenai/ui";
import type { InputHTMLAttributes } from "react";

export function Field({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</label>
      <Input {...props} />
    </div>
  );
}
