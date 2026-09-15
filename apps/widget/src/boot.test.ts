/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { boot } from "./boot.js";

class MockWebSocket {
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

describe("KeenAI.boot", () => {
  afterEach(() => {
    document.querySelectorAll("[data-keenai-widget]").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  it("mounts shadow host and launcher", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    );

    const widget = boot({
      orgSlug: "demo",
      user: { id: "u1", userHash: "a".repeat(64) },
    });

    const host = document.querySelector('[data-keenai-widget="demo"]') as HTMLElement | null;
    expect(host).toBeTruthy();
    expect(host?.shadowRoot?.querySelector(".keenai-launcher")).toBeTruthy();
    expect(host?.shadowRoot?.querySelector(".keenai-panel")).toBeTruthy();

    widget.destroy();
    expect(document.querySelector('[data-keenai-widget="demo"]')).toBeNull();
  });

  it("renders Preact shell and switches from messages to chat", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/api/v1/widget/session")) {
          return jsonResponse({
            accessToken: "widget-token",
            expiresIn: 3600,
            org: { id: "org-1", slug: "demo" },
            brand: { id: "brand-1", slug: "default" },
            user: { id: "u1", userHash: "a".repeat(64) },
          });
        }

        if (url.endsWith("/api/v1/widget/config")) {
          return jsonResponse({
            config: {
              org: { id: "org-1", slug: "demo", name: "Demo" },
              brand: {
                id: "brand-1",
                slug: "default",
                name: "Default",
                primaryColor: "#4652f2",
              },
              agent: {
                name: "Keeni AI Agent",
                subtitle: "The team can also help",
                greetingTitle: "Hey! How can we help?",
                greetingBody: "Ask a question or browse help articles.",
              },
              modules: {
                home: true,
                messages: true,
                help: true,
                changelog: true,
                tickets: true,
              },
              menuItems: [
                bottomNavItem("home", "Home", 0),
                bottomNavItem("messages", "Messages", 1),
                bottomNavItem("help", "Help", 2),
                bottomNavItem("changelog", "Changelog", 3),
              ],
              quickActions: [
                {
                  id: "qa-1",
                  label: "Ask a question",
                  type: "start_chat",
                  payload: {},
                  sortOrder: 0,
                },
              ],
              poweredBy: true,
            },
          });
        }

        if (url.endsWith("/api/v1/widget/home")) {
          return jsonResponse({
            home: {
              greeting: {
                title: "Hey! How can we help?",
                body: "Ask a question or browse help articles.",
              },
              quickActions: [
                {
                  id: "qa-1",
                  label: "Ask a question",
                  type: "start_chat",
                  payload: {},
                  sortOrder: 0,
                },
                {
                  id: "qa-2",
                  label: "Submit ticket",
                  type: "submit_ticket",
                  payload: { type: "support" },
                  sortOrder: 1,
                },
              ],
              featured: [],
              articles: [
                {
                  id: "article-1",
                  title: "Reset password",
                  slug: "reset-password",
                  collection: "account",
                  excerpt: "Go to settings and click reset password.",
                  updatedAt: "2026-09-15T09:00:00.000Z",
                },
              ],
              changelogEntries: [
                {
                  id: "entry-1",
                  slug: "dark-mode",
                  title: "Dark mode is here",
                  summary: "Dashboard and widget now support dark theme.",
                  publishedAt: "2026-09-15T09:00:00.000Z",
                  updatedAt: "2026-09-15T09:00:00.000Z",
                },
              ],
            },
          });
        }

        if (url.endsWith("/api/v1/widget/tickets")) {
          return jsonResponse({
            ticket: {
              id: "ticket-1",
              title: "Need help",
              statusName: "Open",
              conversationIds: ["conv-ticket"],
            },
            conversation: {
              id: "conv-ticket",
              status: "open",
              subject: "Need help",
              customerReplyDisabled: false,
            },
          });
        }

        if (url.endsWith("/api/v1/widget/help/collections")) {
          return jsonResponse({
            items: [{ slug: "account", name: "Account", articleCount: 1 }],
          });
        }

        if (url.endsWith("/api/v1/widget/help/articles")) {
          return jsonResponse({
            items: [
              {
                id: "article-1",
                title: "Reset password",
                slug: "reset-password",
                collection: "account",
                excerpt: "Go to settings and click reset password.",
                updatedAt: "2026-09-15T09:00:00.000Z",
              },
            ],
          });
        }

        if (url.endsWith("/api/v1/widget/changelog/entries")) {
          return jsonResponse({
            items: [
              {
                id: "entry-1",
                slug: "dark-mode",
                title: "Dark mode is here",
                summary: "Dashboard and widget now support dark theme.",
                publishedAt: "2026-09-15T09:00:00.000Z",
                updatedAt: "2026-09-15T09:00:00.000Z",
              },
            ],
          });
        }

        if (url.endsWith("/api/v1/widget/conversations") && method === "POST") {
          return jsonResponse({
            created: true,
            conversation: {
              id: "conv-1",
              status: "open",
              subject: "Question",
              customerReplyDisabled: false,
            },
          });
        }

        if (url.endsWith("/api/v1/widget/conversations") && method === "GET") {
          return jsonResponse({
            items: [
              {
                id: "conv-1",
                status: "open",
                subject: "Question",
                lastMessagePreview: "Hello",
                lastMessageSenderType: "user",
                lastMessageCreatedAt: "2026-09-15T09:00:00.000Z",
                unreadCount: 0,
              },
            ],
          });
        }

        if (url.endsWith("/api/v1/widget/conversations/conv-1/messages")) {
          return jsonResponse({
            items: [
              {
                id: "m1",
                plainText: "Hello",
                senderType: "user",
                createdAt: "2026-09-15T09:00:00.000Z",
              },
            ],
          });
        }

        throw new Error(`unhandled fetch ${method} ${url}`);
      }) as unknown as typeof fetch,
    );

    const widget = boot({
      orgSlug: "demo",
      user: { id: "u1", userHash: "a".repeat(64) },
    });
    widget.open();

    const host = document.querySelector('[data-keenai-widget="demo"]') as HTMLElement;
    const root = host.shadowRoot as ShadowRoot;

    await waitFor(() => root.textContent?.includes("Reset password") ?? false);
    expect(root.textContent).toContain("Reset password");
    expect(root.textContent).toContain("Dark mode is here");

    const submitTicket = Array.from(root.querySelectorAll(".keenai-action-card")).find((button) =>
      button.textContent?.includes("Submit ticket"),
    ) as HTMLButtonElement;
    submitTicket.click();
    await waitFor(() => Boolean(root.querySelector(".keenai-ticket-form")));
    const [titleInput, descriptionInput] = Array.from(
      root.querySelectorAll(".keenai-ticket-form input, .keenai-ticket-form textarea"),
    ) as [HTMLInputElement, HTMLTextAreaElement];
    titleInput.value = "Need help";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    descriptionInput.value = "The widget needs support.";
    descriptionInput.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => {
      const submit = root.querySelector(".keenai-ticket-form button") as HTMLButtonElement | null;
      return Boolean(submit && !submit.disabled);
    });
    const ticketForm = root.querySelector(".keenai-ticket-form") as HTMLFormElement;
    ticketForm.requestSubmit();
    await waitFor(() => root.textContent?.includes("Ticket submitted") ?? false);

    const messagesTab = Array.from(root.querySelectorAll(".keenai-bottom-nav__item")).find(
      (button) => button.textContent === "Messages",
    ) as HTMLButtonElement;
    messagesTab.click();
    await waitFor(() => {
      const text = root.querySelector(".keenai-conversation-row")?.textContent ?? "";
      return text.includes("Question") && text.includes("Hello");
    });

    const row = root.querySelector(".keenai-conversation-row") as HTMLButtonElement;
    row.click();
    await waitFor(() => Boolean(root.querySelector(".keenai-input")));

    const helpTab = Array.from(root.querySelectorAll(".keenai-bottom-nav__item")).find(
      (button) => button.textContent === "Help",
    ) as HTMLButtonElement;
    helpTab.click();
    await waitFor(() => root.textContent?.includes("Account") ?? false);
    const search = root.querySelector('.keenai-search input[type="search"]') as HTMLInputElement;
    search.value = "missing";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => root.textContent?.includes("No matching articles") ?? false);

    const changelogTab = Array.from(root.querySelectorAll(".keenai-bottom-nav__item")).find(
      (button) => button.textContent === "Changelog",
    ) as HTMLButtonElement;
    changelogTab.click();
    await waitFor(() => root.textContent?.includes("Dark mode is here") ?? false);

    widget.destroy();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function bottomNavItem(module: string, label: string, sortOrder: number) {
  return {
    id: `nav-${module}`,
    label,
    type: "module",
    module,
    location: "bottom_nav",
    sortOrder,
  };
}

async function waitFor(assertion: () => boolean): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(assertion()).toBe(true);
}
