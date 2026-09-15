import { render } from "preact";
import { WidgetApp } from "./app/WidgetApp.js";
import { createShadowHost } from "./shadow-host.js";
import type { WidgetUser } from "./types.js";

export type KeenAIBootOptions = {
  orgSlug: string;
  brandSlug?: string;
  apiUrl?: string;
  theme?: "light" | "dark";
  user: WidgetUser;
};

export type KeenAIWidget = {
  open: () => void;
  close: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    KeenAI?: {
      boot: (options: KeenAIBootOptions) => KeenAIWidget;
    };
  }
}

export function boot(options: KeenAIBootOptions): KeenAIWidget {
  const { host, mount } = createShadowHost(options.orgSlug);
  let open = false;
  let destroyed = false;

  const renderApp = () => {
    if (destroyed) return;
    render(
      <WidgetApp
        options={options}
        open={open}
        onOpenChange={(nextOpen) => {
          open = nextOpen;
          renderApp();
        }}
      />,
      mount,
    );
  };

  renderApp();
  document.body.appendChild(host);

  return {
    open: () => {
      open = true;
      renderApp();
    },
    close: () => {
      open = false;
      renderApp();
    },
    destroy: () => {
      destroyed = true;
      render(null, mount);
      host.remove();
    },
  };
}

if (typeof window !== "undefined") {
  window.KeenAI = { boot };
}
