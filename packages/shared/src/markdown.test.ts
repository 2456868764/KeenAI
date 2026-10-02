import { describe, expect, it } from "vitest";
import { renderSafeMarkdownHtml } from "./markdown.js";

describe("renderSafeMarkdownHtml", () => {
  it("renders common markdown with safe external links", () => {
    const html = renderSafeMarkdownHtml("**Important** [docs](https://docs.example.com)");
    expect(html).toContain("<strong>Important</strong>");
    expect(html).toContain('href="https://docs.example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not render raw HTML, unsafe links, or remote markdown images", () => {
    const html = renderSafeMarkdownHtml(
      "<script>alert(1)</script> [bad](javascript:alert(1)) ![pixel](https://track.example/p.gif)",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
