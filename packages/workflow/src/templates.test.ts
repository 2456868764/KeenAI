import { describe, expect, it } from "vitest";
import { workflowDefinitionSchema } from "./schema.js";
import { WORKFLOW_TEMPLATES, listWorkflowTemplates } from "./templates.js";

describe("workflow templates", () => {
  it("ships the documented workflow templates as valid definitions", () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(11);
    expect(new Set(WORKFLOW_TEMPLATES.map((template) => template.id)).size).toBe(
      WORKFLOW_TEMPLATES.length,
    );

    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.id).toMatch(/^tpl-/);
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(() => workflowDefinitionSchema.parse(template.definition)).not.toThrow();
    }
  });

  it("returns cloned template definitions for API callers", () => {
    const [first] = listWorkflowTemplates();
    if (!first) throw new Error("missing_template");

    first.definition.blocks[0] = {
      id: "mutated",
      type: "send_message",
      plainText: "mutated",
    };

    expect(listWorkflowTemplates()[0]?.definition.blocks[0]?.id).not.toBe("mutated");
  });
});
