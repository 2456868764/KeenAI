import { describe, expect, it } from "vitest";
import { createProviderAttachmentUrl, verifyProviderAttachmentToken } from "./attachments.js";

const secret = "provider-attachment-test-secret-at-least-32";
const now = new Date("2026-09-23T12:00:00.000Z");

describe("provider attachment URLs", () => {
  it("creates a scoped URL accepted before its expiry", () => {
    const raw = createProviderAttachmentUrl({
      baseUrl: "https://api.example.com",
      attachmentId: "attachment-1",
      orgId: "org-1",
      secret,
      now,
      ttlMs: 60_000,
    });
    const url = new URL(raw);

    expect(url.pathname).toBe("/api/v1/attachments/attachment-1/provider-content");
    expect(
      verifyProviderAttachmentToken({
        attachmentId: "attachment-1",
        orgId: "org-1",
        expiresAt: url.searchParams.get("expires") ?? "",
        signature: url.searchParams.get("signature") ?? "",
        secret,
        now,
      }),
    ).toBe(true);
  });

  it("rejects tampering, cross-tenant use, and expired URLs", () => {
    const url = new URL(
      createProviderAttachmentUrl({
        baseUrl: "https://api.example.com",
        attachmentId: "attachment-1",
        orgId: "org-1",
        secret,
        now,
        ttlMs: 60_000,
      }),
    );
    const expiresAt = url.searchParams.get("expires") ?? "";
    const signature = url.searchParams.get("signature") ?? "";

    expect(
      verifyProviderAttachmentToken({
        attachmentId: "attachment-2",
        orgId: "org-1",
        expiresAt,
        signature,
        secret,
        now,
      }),
    ).toBe(false);
    expect(
      verifyProviderAttachmentToken({
        attachmentId: "attachment-1",
        orgId: "org-2",
        expiresAt,
        signature,
        secret,
        now,
      }),
    ).toBe(false);
    expect(
      verifyProviderAttachmentToken({
        attachmentId: "attachment-1",
        orgId: "org-1",
        expiresAt,
        signature,
        secret,
        now: new Date(now.getTime() + 60_001),
      }),
    ).toBe(false);
  });
});
