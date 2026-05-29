import type { CustomActionRow } from "@keenai/storage/schema";
import { describe, expect, it, vi } from "vitest";
import {
  executeCustomActionHttpDirect,
  filterCustomActionResponse,
  renderCustomActionTemplate,
  resolveCustomActionSecretFromEnv,
} from "./custom-action-executor.js";

function sampleAction(overrides: Partial<CustomActionRow> = {}): CustomActionRow {
  return {
    id: "act_1",
    orgId: "org_1",
    brandId: "brand_1",
    name: "extend_trial",
    description: null,
    whenToUse: null,
    parametersSchema: { type: "object", properties: {} },
    endpoint: "https://api.example.com/trial/extend/{{user_id}}",
    method: "POST",
    headers: { "X-App": "keenai" },
    authType: "hmac",
    authSecretRef: "vault:extend-trial-hmac",
    dataAccess: { allowFields: ["status", "new_end_date"] },
    sandbox: "http_direct",
    enabled: true,
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("custom action executor", () => {
  it("renders endpoint templates with encoded parameter values", () => {
    const url = renderCustomActionTemplate("https://api.example.com/users/{{user_id}}/trial", {
      user_id: "user 1",
    });
    expect(url).toBe("https://api.example.com/users/user%201/trial");
  });

  it("filters response fields using dataAccess allowFields", () => {
    const filtered = filterCustomActionResponse(
      { status: "ok", new_end_date: "2026-06-01", secret: "hidden" },
      { allowFields: ["status", "new_end_date"] },
    );
    expect(filtered.filtered).toBe(true);
    expect(filtered.data).toEqual({ status: "ok", new_end_date: "2026-06-01" });
  });

  it("resolves vault secret refs from CUSTOM_ACTION_SECRET_* env vars", () => {
    const secret = resolveCustomActionSecretFromEnv("vault:extend-trial-hmac", {
      CUSTOM_ACTION_SECRET_EXTEND_TRIAL_HMAC: "super-secret",
    });
    expect(secret).toBe("super-secret");
  });

  it("executes http_direct actions with HMAC signing", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "X-App": "keenai",
        "Content-Type": "application/json",
        "x-keenai-signature": expect.stringMatching(/^t=\d+,v1=[a-f0-9]{64}$/),
      });
      return new Response(
        JSON.stringify({ status: "ok", new_end_date: "2026-06-01", secret: "x" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const result = await executeCustomActionHttpDirect(
      sampleAction(),
      { parameters: { user_id: "user-1", days: 7 }, timeoutMs: 1000 },
      {
        fetch: fetchMock as typeof fetch,
        getSecret: () => "super-secret",
        now: () => 1_700_000_000_000,
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/trial/extend/user-1",
      expect.any(Object),
    );
    expect(result.ok).toBe(true);
    expect(result.filtered).toBe(true);
    expect(result.data).toEqual({ status: "ok", new_end_date: "2026-06-01" });
  });
});
