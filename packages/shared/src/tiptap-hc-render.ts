export type TiptapDoc = {
  type?: string;
  content?: TiptapNode[];
};

type TiptapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

const CALLOUT_VARIANTS = new Set(["info", "warning", "tip"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarks(text: string, marks: TiptapNode["marks"]): string {
  if (!marks?.length) return escapeHtml(text);
  let out = escapeHtml(text);
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "#";
        out = `<a href="${escapeHtml(href)}">${out}</a>`;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function renderNode(node: TiptapNode): string {
  const children = (node.content ?? []).map(renderNode).join("");

  switch (node.type) {
    case "doc":
      return children;
    case "paragraph":
      return children ? `<p>${children}</p>` : "";
    case "text":
      return renderMarks(node.text ?? "", node.marks);
    case "hardBreak":
      return "<br/>";
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const tag = `h${Math.min(6, Math.max(1, level))}`;
      return `<${tag}>${children}</${tag}>`;
    }
    case "bulletList":
      return `<ul>${children}</ul>`;
    case "orderedList":
      return `<ol>${children}</ol>`;
    case "listItem":
      return `<li>${children}</li>`;
    case "blockquote":
      return `<blockquote>${children}</blockquote>`;
    case "codeBlock": {
      const code = (node.content ?? []).map((child) => child.text ?? "").join("\n");
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    case "hcCallout": {
      const variant =
        typeof node.attrs?.variant === "string" && CALLOUT_VARIANTS.has(node.attrs.variant)
          ? node.attrs.variant
          : "info";
      return `<aside class="hc-callout hc-callout--${variant}" data-hc-callout="${variant}">${children}</aside>`;
    }
    case "hcSteps":
      return `<ol class="hc-steps">${children}</ol>`;
    case "hcStep": {
      const title = typeof node.attrs?.title === "string" ? node.attrs.title : "";
      const titleHtml = title ? `<span class="hc-step__title">${escapeHtml(title)}</span>` : "";
      return `<li class="hc-step">${titleHtml}<div class="hc-step__body">${children}</div></li>`;
    }
    case "hcDetails": {
      const summary =
        typeof node.attrs?.summary === "string" && node.attrs.summary.trim()
          ? node.attrs.summary
          : "Details";
      return `<details class="hc-details"><summary>${escapeHtml(summary)}</summary><div class="hc-details__body">${children}</div></details>`;
    }
    default:
      return children;
  }
}

/** Render Help Center Tiptap JSON (StarterKit + HC blocks) to static HTML. */
export function renderTiptapHcToHtml(doc: Record<string, unknown> | null | undefined): string {
  if (!doc || typeof doc !== "object") return "";
  const root = doc as TiptapDoc;
  if (root.type !== "doc" || !Array.isArray(root.content)) return "";
  return renderNode(root);
}
