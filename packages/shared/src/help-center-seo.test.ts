import { describe, expect, it } from "vitest";
import {
  buildArticleJsonLd,
  buildHelpCenterSitemapEntries,
  getPortalOrgSlugFromEnv,
  getPortalSiteUrlFromEnv,
} from "./help-center-seo.js";

describe("help-center-seo", () => {
  it("builds sitemap entries for help index and articles", () => {
    const entries = buildHelpCenterSitemapEntries("https://help.acme.test", [
      { id: "art-1", updatedAt: "2026-05-01T12:00:00.000Z" },
      { id: "art-2" },
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0]?.url).toBe("https://help.acme.test/help");
    expect(entries[1]?.url).toBe("https://help.acme.test/help/art-1");
    expect(entries[1]?.lastModified?.toISOString()).toBe("2026-05-01T12:00:00.000Z");
    expect(entries[2]?.url).toBe("https://help.acme.test/help/art-2");
  });

  it("builds schema.org Article JSON-LD", () => {
    const jsonLd = buildArticleJsonLd({
      url: "https://help.acme.test/help/art-1",
      title: "Reset password",
      description: "How to reset your password",
      updatedAt: "2026-05-01T12:00:00.000Z",
      collection: "Account",
    });

    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe("Reset password");
    expect(jsonLd.articleSection).toBe("Account");
  });

  it("reads portal env defaults", () => {
    expect(getPortalOrgSlugFromEnv({})).toBe("demo");
    expect(getPortalSiteUrlFromEnv({})).toBe("http://localhost:3002");
    expect(getPortalOrgSlugFromEnv({ NEXT_PUBLIC_PORTAL_ORG_SLUG: "acme" })).toBe("acme");
    expect(getPortalSiteUrlFromEnv({ NEXT_PUBLIC_PORTAL_URL: "https://help.acme.test/" })).toBe(
      "https://help.acme.test",
    );
  });
});
