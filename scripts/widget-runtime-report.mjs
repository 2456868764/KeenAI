import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(ROOT, "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function responseJson(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function waitFor(check, label, timeoutMs = 1500) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const result = check();
        if (result) {
          resolve(result);
          return;
        }
      } catch {
        // Keep polling until timeout so async widget setup can settle.
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="host-page"></main></body></html>', {
    url: "https://customer.example.test/",
    pretendToBeVisual: true,
  });

  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    ShadowRoot: dom.window.ShadowRoot,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    File: dom.window.File,
    Blob: dom.window.Blob,
    FormData: dom.window.FormData,
  })) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }

  return dom;
}

function installFetchMock(calls) {
  const messageCreatedAt = new Date("2026-07-10T00:00:00.000Z").toISOString();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ method: init.method ?? "GET", path: url.pathname });

    if (url.pathname === "/api/v1/widget/session" && init.method === "POST") {
      return responseJson({
        accessToken: "widget-token-runtime",
        expiresIn: 3600,
        org: { id: "org_runtime", slug: "runtime-demo" },
        brand: { id: "brand_default", slug: "default" },
        user: { id: "customer_1", userHash: "a".repeat(64) },
      });
    }

    if (url.pathname === "/api/v1/widget/conversations" && init.method === "POST") {
      return responseJson(
        {
          conversation: {
            id: "conv_runtime",
            status: "open",
            subject: "Runtime widget smoke",
          },
          created: true,
        },
        { status: 201 },
      );
    }

    if (url.pathname === "/api/v1/widget/conversations/conv_runtime/messages") {
      if ((init.method ?? "GET") === "GET") {
        return responseJson({
          items: [
            {
              id: "msg_agent_welcome",
              senderType: "agent",
              plainText: "Welcome to KeenAI support.",
              attachments: [],
              createdAt: messageCreatedAt,
            },
          ],
        });
      }

      if (init.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        return responseJson({
          message: {
            id: "msg_user_runtime",
            senderType: "user",
            plainText: body.plainText,
            attachments: [],
            createdAt: messageCreatedAt,
          },
        });
      }
    }

    return responseJson({ error: `unexpected_request:${url.pathname}` }, { status: 404 });
  };
}

function installWebSocketMock(events) {
  class FakeWebSocket {
    static instances = [];

    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      FakeWebSocket.instances.push(this);
      events.push({ type: "connect", url });
      setTimeout(() => this.dispatch("open"), 0);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    dispatch(type, payload = {}) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ type, target: this, ...payload });
      }
    }

    close() {
      events.push({ type: "close", url: this.url });
      this.dispatch("close");
    }
  }

  globalThis.WebSocket = FakeWebSocket;
  globalThis.window.WebSocket = FakeWebSocket;
}

function renderMarkdown(report) {
  const checks = Object.entries(report.checks)
    .map(([key, value]) => `| ${key} | ${value ? "pass" : "fail"} |`)
    .join("\n");

  return [
    "# Widget Runtime Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| api_calls | ${report.apiCalls.length} |`,
    `| websocket_connections | ${report.websocketEvents.filter((event) => event.type === "connect").length} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
    "## Checks",
    "",
    "| Check | Status |",
    "|-------|--------|",
    checks,
    "",
  ].join("\n");
}

const apiCalls = [];
const websocketEvents = [];
const checks = {
  shadowHostMounted: false,
  launcherTogglesPanel: false,
  sessionRequested: false,
  conversationCreated: false,
  historyRendered: false,
  websocketConnected: false,
  messagePosted: false,
  sentMessageRendered: false,
  destroyRemovesHost: false,
};
const failures = [];

installDom();
installFetchMock(apiCalls);
installWebSocketMock(websocketEvents);

try {
  const { boot } = await import("../apps/widget/src/boot.ts");
  const widget = boot({
    orgSlug: "runtime-demo",
    brandSlug: "default",
    apiUrl: "https://api.example.test",
    user: { id: "customer_1", userHash: "a".repeat(64) },
  });

  const host = await waitFor(
    () => document.querySelector('[data-keenai-widget="runtime-demo"]'),
    "shadow host",
  );
  checks.shadowHostMounted = Boolean(host?.shadowRoot);

  const panel = host.shadowRoot.querySelector(".keenai-panel");
  const launcher = host.shadowRoot.querySelector(".keenai-launcher");
  launcher.click();
  checks.launcherTogglesPanel = panel.hidden === false;

  await waitFor(
    () => host.shadowRoot.querySelector(".keenai-status")?.textContent === "Live",
    "live websocket status",
  );
  checks.sessionRequested = apiCalls.some(
    (call) => call.method === "POST" && call.path === "/api/v1/widget/session",
  );
  checks.conversationCreated = apiCalls.some(
    (call) => call.method === "POST" && call.path === "/api/v1/widget/conversations",
  );
  checks.historyRendered = [...host.shadowRoot.querySelectorAll(".keenai-bubble__text")].some(
    (node) => node.textContent?.includes("Welcome to KeenAI support."),
  );
  checks.websocketConnected = websocketEvents.some(
    (event) =>
      event.type === "connect" &&
      event.url.includes("/api/v1/widget/conversations/conv_runtime/ws"),
  );

  const input = host.shadowRoot.querySelector(".keenai-input");
  const form = host.shadowRoot.querySelector(".keenai-compose");
  input.value = "I need help with billing";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  await waitFor(
    () =>
      [...host.shadowRoot.querySelectorAll(".keenai-bubble__text")].some((node) =>
        node.textContent?.includes("I need help with billing"),
      ),
    "sent message render",
  );
  checks.messagePosted = apiCalls.some(
    (call) =>
      call.method === "POST" && call.path === "/api/v1/widget/conversations/conv_runtime/messages",
  );
  checks.sentMessageRendered = true;

  widget.destroy();
  checks.destroyRemovesHost =
    document.querySelector('[data-keenai-widget="runtime-demo"]') === null;
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

for (const [key, passed] of Object.entries(checks)) {
  if (!passed) failures.push(`${key} failed`);
}

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length === 0 ? "pass" : "fail",
  mode: "jsdom",
  checks,
  apiCalls,
  websocketEvents,
  failures,
};

const jsonPath = outputPath("WIDGET_RUNTIME_REPORT_JSON_OUT", "widget-runtime.json");
const markdownPath = outputPath("WIDGET_RUNTIME_REPORT_MD", "widget-runtime.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
