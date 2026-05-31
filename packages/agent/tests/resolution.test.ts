import { describe, expect, it } from "vitest";
import { detectResolution } from "../src/resolution.js";

describe("detectResolution", () => {
  it("detects confirmed resolution from customer feedback", () => {
    const result = detectResolution({
      replyText: "Glad we could help with your order.",
      customerMessage: "Thanks, that fixed it!",
    });
    expect(result.type).toBe("confirmed");
  });

  it("detects escalation language", () => {
    const result = detectResolution({
      replyText: "I will transfer you to a human agent now.",
    });
    expect(result.type).toBe("escalated");
  });

  it("detects assumed resolution from agent reply", () => {
    const result = detectResolution({
      replyText: "Your issue is resolved and should be all set now.",
    });
    expect(result.type).toBe("assumed");
  });

  it("marks failed runs as unresolved", () => {
    const result = detectResolution({
      replyText: "",
      hadError: true,
    });
    expect(result.type).toBe("unresolved");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
