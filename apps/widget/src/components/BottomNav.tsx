import type { WidgetView } from "../app/routes.js";
import { viewFromModule } from "../app/routes.js";
import type { WidgetConfig, WidgetModuleKey } from "../types.js";

const FALLBACK_ITEMS: { label: string; module: WidgetModuleKey }[] = [
  { label: "Home", module: "home" },
  { label: "Messages", module: "messages" },
  { label: "Help", module: "help" },
  { label: "Changelog", module: "changelog" },
];

type BottomNavProps = {
  config: WidgetConfig | null;
  view: WidgetView;
  onViewChange: (view: WidgetView) => void;
};

export function BottomNav({ config, view, onViewChange }: BottomNavProps) {
  const items =
    config?.menuItems
      .filter((item) => item.location === "bottom_nav" && item.type === "module" && item.module)
      .filter((item) => config.modules[item.module as WidgetModuleKey])
      .map((item) => ({
        id: item.id,
        label: item.label,
        module: item.module as WidgetModuleKey,
      })) ??
    FALLBACK_ITEMS.filter((item) => config?.modules[item.module] ?? true).map((item) => ({
      id: item.module,
      ...item,
    }));

  return (
    <nav className="keenai-bottom-nav" aria-label="Widget navigation">
      {items.map((item) => {
        const itemView = viewFromModule(item.module);
        const active = view === itemView || (view === "chat" && item.module === "messages");
        return (
          <button
            key={item.id}
            type="button"
            className={active ? "keenai-bottom-nav__item is-active" : "keenai-bottom-nav__item"}
            onClick={() => onViewChange(itemView)}
          >
            <span className="keenai-bottom-nav__dot" aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
