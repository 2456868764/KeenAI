/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { boot } from "./boot.js";

describe("KeenAI.boot", () => {
  afterEach(() => {
    document.querySelectorAll("[data-keenai-widget]").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  it("mounts shadow host and launcher", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    );

    const widget = boot({
      orgSlug: "demo",
      user: { id: "u1", userHash: "a".repeat(64) },
    });

    const host = document.querySelector('[data-keenai-widget="demo"]') as HTMLElement | null;
    expect(host).toBeTruthy();
    expect(host?.shadowRoot?.querySelector(".keenai-launcher")).toBeTruthy();
    expect(host?.shadowRoot?.querySelector(".keenai-panel")).toBeTruthy();

    widget.destroy();
    expect(document.querySelector('[data-keenai-widget="demo"]')).toBeNull();
  });
});
