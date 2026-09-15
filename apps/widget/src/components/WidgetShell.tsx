import type { ComponentChildren, JSX } from "preact";
import type { WidgetView } from "../app/routes.js";
import type { WidgetConfig } from "../types.js";
import { BottomNav } from "./BottomNav.js";
import { Header } from "./Header.js";

type WidgetShellProps = {
  open: boolean;
  view: WidgetView;
  title: string;
  subtitle?: string;
  config: WidgetConfig | null;
  status: string;
  showBack?: boolean;
  onBack?: () => void;
  onViewChange: (view: WidgetView) => void;
  children: ComponentChildren;
};

export function WidgetShell({
  open,
  view,
  title,
  subtitle,
  config,
  status,
  showBack,
  onBack,
  onViewChange,
  children,
}: WidgetShellProps) {
  const style = config?.brand.primaryColor
    ? ({
        "--widget-primary": config.brand.primaryColor,
        "--widget-primary-strong": config.brand.primaryColor,
      } as JSX.CSSProperties)
    : undefined;

  return (
    <section className="keenai-panel" hidden={!open} aria-label="KeenAI messenger" style={style}>
      <Header title={title} subtitle={subtitle} showBack={showBack} onBack={onBack} />
      <div className="keenai-status" aria-live="polite">
        {status}
      </div>
      <main className="keenai-view">{children}</main>
      <BottomNav config={config} view={view} onViewChange={onViewChange} />
    </section>
  );
}
