import { Input, cn } from "@keenai/ui";
import type { InputHTMLAttributes } from "react";
import { useId } from "react";

export function Field({
  label,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
        {label}
      </label>
      <Input id={inputId} {...props} />
    </div>
  );
}
