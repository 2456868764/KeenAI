import MarkdownIt from "markdown-it";

const renderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
});

renderer.disable("image");
renderer.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index];
  token?.attrSet("target", "_blank");
  token?.attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, index, options);
};

export function renderSafeMarkdownHtml(markdown: string): string {
  return renderer.render(markdown);
}
