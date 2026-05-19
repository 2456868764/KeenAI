import { describe, expect, it } from "vitest";
import { parseApiError } from "./api-errors";

describe("parseApiError", () => {
  it("extracts message from JSON", () => {
    const msg = parseApiError(
      JSON.stringify({ error: "invalid_credentials", message: "Invalid email or password" }),
    );
    expect(msg).toBe("Invalid email or password");
  });

  it("maps known error codes", () => {
    expect(parseApiError(JSON.stringify({ error: "invalid_credentials" }))).toBe(
      "Invalid email or password",
    );
  });
});
