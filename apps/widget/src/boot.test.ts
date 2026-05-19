/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { boot } from "./boot";

describe("KeenAI.boot", () => {
  afterEach(() => {
    document.querySelectorAll("[data-keenai-widget]").forEach((el) => el.remove());
  });

  it("mounts launcher and toggles panel", () => {
    const widget = boot({ orgSlug: "demo" });
    expect(document.querySelector('[data-keenai-widget="demo"]')).toBeTruthy();

    widget.open();
    const panel = document.querySelector('[data-keenai-widget="demo"] div');
    expect(panel?.hasAttribute("hidden")).toBe(false);

    widget.close();
    expect(panel?.hasAttribute("hidden")).toBe(true);

    widget.destroy();
    expect(document.querySelector('[data-keenai-widget="demo"]')).toBeNull();
  });
});
