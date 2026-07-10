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

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    url: "https://dashboard.example.test/inbox",
    pretendToBeVisual: true,
  });

  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
  })) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }

  return dom;
}

function renderInboxShell(root, conversations) {
  root.replaceChildren();
  const shell = document.createElement("section");
  shell.setAttribute("data-dogfood", "inbox");

  const heading = document.createElement("h1");
  heading.textContent = "Inbox";

  const count = document.createElement("p");
  count.setAttribute("data-testid", "conversation-count");
  count.textContent = `${conversations.length} shown`;

  const list = document.createElement("ul");
  list.setAttribute("aria-label", "Conversations");
  for (const conversation of conversations) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.conversationId = conversation.id;
    button.textContent = conversation.subject ?? conversation.id;
    item.append(button);
    list.append(item);
  }

  shell.append(heading, count, list);
  root.append(shell);
}

function renderThread(root, conversation, messages) {
  const thread = document.createElement("section");
  thread.setAttribute("data-dogfood", "thread");

  const title = document.createElement("h2");
  title.textContent = conversation.subject ?? "Conversation";
  const meta = document.createElement("p");
  meta.setAttribute("data-testid", "conversation-meta");
  meta.textContent = `${conversation.status} · assignee ${conversation.assigneeId ?? "none"}`;

  const log = document.createElement("div");
  log.setAttribute("role", "log");
  for (const message of messages) {
    const row = document.createElement("p");
    row.dataset.senderType = message.senderType;
    row.textContent = message.plainText;
    log.append(row);
  }

  thread.append(title, meta, log);
  root.append(thread);
}

function installFetchMock(calls) {
  const state = {
    token: "agent-token-dogfood",
    conversation: {
      id: "conv_dogfood",
      subject: "Billing invoice question",
      status: "open",
      channelType: "email",
      assigneeId: null,
      tags: ["billing"],
      snoozedUntil: null,
      priority: "normal",
      unreadCount: 1,
      messageCount: 1,
      lastMessageAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
    messages: [
      {
        id: "msg_customer",
        conversationId: "conv_dogfood",
        senderType: "user",
        senderId: "customer_1",
        plainText: "Can I get a copy of my invoice?",
        isInternal: false,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ],
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const auth = new Headers(init.headers).get("Authorization");
    calls.push({ method, path: url.pathname, authorized: auth === `Bearer ${state.token}` });

    if (url.pathname === "/api/v1/auth/login" && method === "POST") {
      return responseJson({
        accessToken: state.token,
        role: "agent",
        orgId: "org_dogfood",
      });
    }

    if (auth !== `Bearer ${state.token}`) {
      return responseJson({ error: "unauthorized" }, { status: 401 });
    }

    if (url.pathname === "/api/v1/conversations" && method === "GET") {
      return responseJson({ items: [state.conversation], nextCursor: null });
    }

    if (url.pathname === "/api/v1/conversations/conv_dogfood" && method === "GET") {
      return responseJson({ conversation: state.conversation });
    }

    if (url.pathname === "/api/v1/conversations/conv_dogfood/messages" && method === "GET") {
      return responseJson({ items: state.messages });
    }

    if (url.pathname === "/api/v1/conversations/conv_dogfood/messages" && method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const message = {
        id: "msg_agent_reply",
        conversationId: "conv_dogfood",
        senderType: "agent",
        senderId: "agent_1",
        plainText: body.plainText,
        isInternal: Boolean(body.isInternal),
        createdAt: "2026-07-10T00:01:00.000Z",
      };
      state.messages.push(message);
      state.conversation.messageCount = state.messages.length;
      state.conversation.unreadCount = 0;
      return responseJson({ message });
    }

    if (url.pathname === "/api/v1/conversations/conv_dogfood" && method === "PATCH") {
      const patch = JSON.parse(String(init.body ?? "{}"));
      state.conversation = { ...state.conversation, ...patch };
      return responseJson({ conversation: state.conversation });
    }

    return responseJson({ error: `unexpected_request:${url.pathname}` }, { status: 404 });
  };

  return state;
}

function renderMarkdown(report) {
  const checks = Object.entries(report.checks)
    .map(([key, value]) => `| ${key} | ${value ? "pass" : "fail"} |`)
    .join("\n");

  return [
    "# Support Dogfood Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| mode | ${report.mode} |`,
    `| conversation_id | ${report.conversationId ?? "n/a"} |`,
    `| api_calls | ${report.apiCalls.length} |`,
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
const checks = {
  loginStoresToken: false,
  inboxListRendered: false,
  conversationSelected: false,
  messagesRendered: false,
  agentReplySent: false,
  assigneeUpdated: false,
  conversationClosed: false,
  authorizedApiCalls: false,
};
const failures = [];
let conversationId = null;

installDom();
installFetchMock(apiCalls);

try {
  const api = await import("../apps/dashboard/src/lib/api.ts");
  const authStore = await import("../apps/dashboard/src/lib/auth-store.ts");

  const loginResult = await api.login("agent@keenai.local", "keenai-demo-12", "demo");
  authStore.setAccessToken(loginResult.accessToken);
  checks.loginStoresToken = authStore.getAccessToken() === loginResult.accessToken;

  const inbox = await api.listConversations({ status: "open" });
  const root = document.getElementById("app");
  renderInboxShell(root, inbox.items);
  checks.inboxListRendered =
    document.querySelector('[data-testid="conversation-count"]')?.textContent === "1 shown" &&
    Boolean(document.querySelector('[data-conversation-id="conv_dogfood"]'));

  const selectButton = document.querySelector('[data-conversation-id="conv_dogfood"]');
  selectButton.click();
  conversationId = selectButton.dataset.conversationId;
  checks.conversationSelected = conversationId === "conv_dogfood";

  const [{ conversation }, { items: messages }] = await Promise.all([
    api.getConversation(conversationId),
    api.listMessages(conversationId),
  ]);
  renderThread(root, conversation, messages);
  checks.messagesRendered = [...document.querySelectorAll('[role="log"] p')].some((node) =>
    node.textContent?.includes("Can I get a copy of my invoice?"),
  );

  const reply = await api.sendMessage(conversationId, "I sent the invoice to your email.", {
    isInternal: false,
  });
  checks.agentReplySent = reply.message.senderType === "agent";

  const assigned = await api.updateConversation(conversationId, { assigneeId: "agent_1" });
  checks.assigneeUpdated = assigned.conversation.assigneeId === "agent_1";

  const closed = await api.updateConversation(conversationId, { status: "closed" });
  checks.conversationClosed = closed.conversation.status === "closed";

  checks.authorizedApiCalls = apiCalls
    .filter((call) => call.path !== "/api/v1/auth/login")
    .every((call) => call.authorized);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

for (const [key, passed] of Object.entries(checks)) {
  if (!passed) failures.push(`${key} failed`);
}

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length === 0 ? "pass" : "fail",
  mode: "jsdom-dashboard-api-client",
  conversationId,
  checks,
  apiCalls,
  failures,
};

const jsonPath = outputPath("SUPPORT_DOGFOOD_REPORT_JSON_OUT", "support-dogfood.json");
const markdownPath = outputPath("SUPPORT_DOGFOOD_REPORT_MD", "support-dogfood.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (report.evidenceStatus === "fail") {
  process.exitCode = 1;
}
