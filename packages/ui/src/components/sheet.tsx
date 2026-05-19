import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

export function Sheet({ children, ...props }: Dialog.DialogProps) {
  return <Dialog.Root {...props}>{children}</Dialog.Root>;
}

export function SheetTrigger(props: Dialog.DialogTriggerProps) {
  return <Dialog.Trigger {...props} />;
}

export function SheetContent({
  className,
  children,
  side = "right",
}: {
  className?: string;
  children: ReactNode;
  side?: "left" | "right";
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <Dialog.Content
        className={cn(
          "fixed z-50 flex h-full w-full max-w-md flex-col gap-4 border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-6 shadow-lg",
          side === "right" ? "inset-y-0 right-0" : "inset-y-0 left-0",
          className,
        )}
      >
        {children}
        <Dialog.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: Dialog.DialogTitleProps) {
  return (
    <Dialog.Title className={cn("text-lg font-semibold leading-none", className)} {...props} />
  );
}
