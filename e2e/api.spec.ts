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

  test("GET /api/v1/openapi.json returns OpenAPI document", async ({ request }) => {
    const res = await request.get(`${apiUrl}/api/v1/openapi.json`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { openapi?: string; paths?: Record<string, unknown> };
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toBeTruthy();
  });

  test("authenticated workflows, tickets, and analytics endpoints", async ({ request }) => {
    const loginRes = await request.post(`${apiUrl}/api/v1/auth/login`, {
      data: {
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "demo",
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const workflows = await request.get(`${apiUrl}/api/v1/workflows`, { headers: auth });
    expect(workflows.ok()).toBeTruthy();
    const workflowsBody = (await workflows.json()) as { items: unknown[] };
    expect(Array.isArray(workflowsBody.items)).toBe(true);

    const tickets = await request.get(`${apiUrl}/api/v1/tickets`, { headers: auth });
    expect(tickets.ok()).toBeTruthy();
    const ticketsBody = (await tickets.json()) as { items: unknown[] };
    expect(Array.isArray(ticketsBody.items)).toBe(true);

    const analytics = await request.get(`${apiUrl}/api/v1/analytics/dashboard`, { headers: auth });
    expect(analytics.ok()).toBeTruthy();
    const analyticsBody = (await analytics.json()) as {
      dashboard?: { support?: unknown; feedback?: unknown };
    };
    expect(analyticsBody.dashboard?.support).toBeTruthy();
    expect(analyticsBody.dashboard?.feedback).toBeTruthy();
  });

  test("GET /api/v1/mcp/expose/tools returns KeenAI server catalog", async ({ request }) => {
    const loginRes = await request.post(`${apiUrl}/api/v1/auth/login`, {
      data: {
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "demo",
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const res = await request.get(`${apiUrl}/api/v1/mcp/expose/tools`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { transport?: string; items: unknown[] };
    expect(body.transport).toBe("stdio");
    expect(Array.isArray(body.items)).toBe(true);
  });
});
