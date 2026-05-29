import { describe, expect, it } from "vitest";
import { signCustomActionRequest } from "./custom-action-hmac.js";

describe("signCustomActionRequest", () => {
  it("produces a stable v1 signature for a fixed timestamp", () => {
    const input = {
      secret: "test-secret",
      method: "POST",
      url: "https://api.example.com/trial/extend/user-1",
      body: JSON.stringify({ days: 7 }),
      timestamp: 1_700_000_000,
    };
    const signed = signCustomActionRequest(input);

    expect(signed.headerName).toBe("x-keenai-signature");
    expect(signed.headerValue).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/);
    expect(signed.headerValue).toBe(signCustomActionRequest(input).headerValue);
  });

  it("changes signature when body changes", () => {
    const base = {
      secret: "test-secret",
      method: "POST",
      url: "https://api.example.com/trial/extend/user-1",
      timestamp: 1_700_000_000,
    };
    const a = signCustomActionRequest({ ...base, body: '{"days":7}' });
    const b = signCustomActionRequest({ ...base, body: '{"days":14}' });
    expect(a.headerValue).not.toBe(b.headerValue);
  });
});
