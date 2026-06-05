import { describe, expect, it } from "vitest";
import { renderTiptapHcToHtml } from "./tiptap-hc-render.js";

describe("renderTiptapHcToHtml", () => {
  it("renders callout, steps, and details blocks", () => {
    const html = renderTiptapHcToHtml({
      type: "doc",
      content: [
        {
          type: "hcCallout",
          attrs: { variant: "warning" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Be careful" }] }],
        },
        {
          type: "hcSteps",
          content: [
            {
              type: "hcStep",
              attrs: { title: "Step 1" },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Open settings" }] }],
            },
          ],
        },
        {
          type: "hcDetails",
          attrs: { summary: "More info" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden body" }] }],
        },
      ],
    });

    expect(html).toContain('class="hc-callout hc-callout--warning"');
    expect(html).toContain('class="hc-steps"');
    expect(html).toContain("Step 1");
    expect(html).toContain("<summary>More info</summary>");
    expect(html).toContain("Hidden body");
  });

  it("returns empty string for invalid doc", () => {
    expect(renderTiptapHcToHtml(null)).toBe("");
    expect(renderTiptapHcToHtml({ type: "paragraph" })).toBe("");
  });
});
