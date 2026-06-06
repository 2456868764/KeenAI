import { expect, test } from "@playwright/test";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8190";

test.describe("API smoke @smoke", () => {
  test("GET /health returns ok", async ({ request }) => {
    const res = await request.get(`${apiUrl}/health`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("ok");
  });

  test("GET /api/v1/health returns ok", async ({ request }) => {
    const res = await request.get(`${apiUrl}/api/v1/health`);
    expect(res.ok()).toBeTruthy();
  });

  test("public help center collections for demo org", async ({ request }) => {
    const res = await request.get(`${apiUrl}/api/v1/public/demo/kb/collections`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("public meta returns demo brand", async ({ request }) => {
    const res = await request.get(`${apiUrl}/api/v1/public/demo/meta`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      org: { slug: string };
      brand: { id: string; slug: string };
    };
    expect(body.org.slug).toBe("demo");
    expect(body.brand.slug).toBe("default");
    expect(body.brand.id).toBeTruthy();
  });

  test("public kb search accepts query", async ({ request }) => {
    const metaRes = await request.get(`${apiUrl}/api/v1/public/demo/meta`);
    const meta = (await metaRes.json()) as { brand: { id: string } };
    const params = new URLSearchParams({
      brandId: meta.brand.id,
      q: "KeenAI",
      limit: "5",
      rerank: "false",
    });
    const res = await request.get(`${apiUrl}/api/v1/public/demo/kb/search?${params}`);
    expect([200, 503]).toContain(res.status());
    if (res.ok()) {
      const body = (await res.json()) as { results: { hits: unknown[] }; logId?: string };
      expect(Array.isArray(body.results.hits)).toBe(true);
    }
  });

  test("public kb answer streams SSE", async ({ request }) => {
    const metaRes = await request.get(`${apiUrl}/api/v1/public/demo/meta`);
    const meta = (await metaRes.json()) as { brand: { id: string } };
    const params = new URLSearchParams({
      brandId: meta.brand.id,
      q: "KeenAI",
      limit: "3",
      rerank: "false",
    });
    const res = await request.get(`${apiUrl}/api/v1/public/demo/kb/answer?${params}`);
    expect([200, 503]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.text();
      expect(body).toContain("event: meta");
      expect(body).toContain("event: done");
    }
  });

  test("auth login with seeded demo user", async ({ request }) => {
    const res = await request.post(`${apiUrl}/api/v1/auth/login`, {
      data: {
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "demo",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { accessToken?: string };
    expect(body.accessToken).toBeTruthy();
  });
});
