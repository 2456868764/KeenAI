export type KeenAIBootOptions = {
  orgSlug: string;
  apiUrl?: string;
  theme?: "light" | "dark";
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
  const host = document.createElement("div");
  host.setAttribute("data-keenai-widget", options.orgSlug);
  host.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483646;font-family:system-ui,sans-serif;";
  document.body.appendChild(host);

  const panel = document.createElement("div");
  panel.hidden = true;
  panel.style.cssText =
    "width:360px;max-width:calc(100vw - 32px);height:480px;max-height:70vh;border-radius:12px;background:#1a1a1f;color:#f4f4f5;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:14px;";
  panel.textContent = `KeenAI · ${options.orgSlug}`;
  host.appendChild(panel);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open KeenAI messenger");
  launcher.style.cssText =
    "margin-top:8px;width:48px;height:48px;border-radius:9999px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-weight:700;";
  launcher.textContent = "K";
  host.appendChild(launcher);

  const toggle = () => {
    panel.hidden = !panel.hidden;
  };

  launcher.addEventListener("click", toggle);

  return {
    open: () => {
      panel.hidden = false;
    },
    close: () => {
      panel.hidden = true;
    },
    destroy: () => {
      host.remove();
    },
  };
}

if (typeof window !== "undefined") {
  window.KeenAI = { boot };
}
