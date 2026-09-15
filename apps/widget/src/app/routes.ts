import type { WidgetModuleKey } from "../types.js";

export type WidgetView = Exclude<WidgetModuleKey, "tickets"> | "chat" | "ticket";

export function viewFromModule(module: WidgetModuleKey): WidgetView {
  return module === "tickets" ? "chat" : module;
}
