/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { boot } from "./boot.js";

describe("KeenAI.boot", () => {
  afterEach(() => {
    document.querySelectorAll("[data-keenai-widget]").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  it("mounts launcher and panel chrome", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    );

    const widget = boot({
      orgSlug: "demo",
      user: { id: "u1", userHash: "a".repeat(64) },
    });

    expect(document.querySelector('[data-keenai-widget="demo"]')).toBeTruthy();
    expect(document.querySelector("button[aria-label='Open KeenAI messenger']")).toBeTruthy();

    widget.destroy();
    expect(document.querySelector('[data-keenai-widget="demo"]')).toBeNull();
  });
});
