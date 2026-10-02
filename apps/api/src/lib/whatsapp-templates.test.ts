import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  listWhatsAppTemplates,
  updateWhatsAppTemplate,
  whatsappTemplateCredentials,
} from "./whatsapp-templates.js";

const credentials = {
  accessToken: "secret-token",
  wabaId: "1234",
  graphApiVersion: "v20.0",
};

afterEach(() => vi.unstubAllGlobals());

describe("WhatsApp template management", () => {
  it("preserves the WABA template collection path", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listWhatsAppTemplates(credentials);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/1234/message_templates?");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("%2Fmessage_templates");
  });

  it("requires a WABA and accepts a configured Graph version", () => {
    expect(
      whatsappTemplateCredentials(
        { accessToken: "token", wabaId: "123", graphApiVersion: "v22.0" },
        "v20.0",
      ),
    ).toEqual({ accessToken: "token", wabaId: "123", graphApiVersion: "v22.0" });
    expect(() => whatsappTemplateCredentials({ accessToken: "token" }, "v20.0")).toThrow(
      "whatsapp_wabaId_missing",
    );
  });

  it("lists all pages and normalizes provider templates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "t1",
              name: "order_update",
              language: "en_US",
              status: "APPROVED",
              category: "UTILITY",
              components: [{ type: "BODY", text: "Order ready" }],
            },
          ],
          paging: { cursors: { after: "next-page" } },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listWhatsAppTemplates(credentials);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("order_update");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("after=next-page");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("creates, edits and deletes templates through the provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "t2", status: "PENDING", category: "UTILITY" }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      name: "shipping_update",
      language: "en_US",
      category: "UTILITY" as const,
      components: [{ type: "BODY", text: "Your order shipped." }],
    };

    expect(await createWhatsAppTemplate(credentials, input)).toEqual({
      id: "t2",
      status: "PENDING",
      category: "UTILITY",
    });
    expect(
      await updateWhatsAppTemplate(credentials, "t2", { components: input.components }),
    ).toEqual({ success: true });
    expect(
      await deleteWhatsAppTemplate(credentials, { name: input.name, templateId: "t2" }),
    ).toEqual({ success: true });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://graph.facebook.com/v20.0/t2");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("hsm_id=t2");
  });
});
