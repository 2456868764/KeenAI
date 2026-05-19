import { WIDGET_CSS } from "./widget-styles.js";

export function createShadowHost(orgSlug: string): {
  host: HTMLElement;
  root: ShadowRoot;
  mount: HTMLElement;
} {
  const host = document.createElement("div");
  host.setAttribute("data-keenai-widget", orgSlug);
  host.className = "keenai-host";
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483646;";

  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = WIDGET_CSS;
  const mount = document.createElement("div");
  mount.className = "keenai-root";
  root.append(style, mount);

  return { host, root, mount };
}
