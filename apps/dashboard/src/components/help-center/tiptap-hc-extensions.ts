import { Node, mergeAttributes } from "@tiptap/core";

export const HcCallout = Node.create({
  name: "hcCallout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      variant: { default: "info" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-hc-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const variant = HTMLAttributes.variant ?? "info";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-hc-callout": variant,
        class: `hc-callout hc-callout--${variant}`,
      }),
      0,
    ];
  },
});

export const HcStep = Node.create({
  name: "hcStep",
  group: "hcStep",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      title: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "li[data-hc-step]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes, { "data-hc-step": "", class: "hc-step" }), 0];
  },
});

export const HcSteps = Node.create({
  name: "hcSteps",
  group: "block",
  content: "hcStep+",
  defining: true,
  parseHTML() {
    return [{ tag: "ol[data-hc-steps]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["ol", mergeAttributes(HTMLAttributes, { "data-hc-steps": "", class: "hc-steps" }), 0];
  },
});

export const HcDetails = Node.create({
  name: "hcDetails",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      summary: { default: "Details" },
    };
  },
  parseHTML() {
    return [{ tag: "details[data-hc-details]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const summary = HTMLAttributes.summary ?? "Details";
    return [
      "details",
      mergeAttributes(HTMLAttributes, { "data-hc-details": "", class: "hc-details" }),
      ["summary", {}, summary],
      ["div", { class: "hc-details__body" }, 0],
    ];
  },
});

export const hcTiptapExtensions = [HcCallout, HcSteps, HcStep, HcDetails];
