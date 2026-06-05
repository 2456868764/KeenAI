"use client";

import { Button } from "@keenai/ui";
import type { Editor } from "@tiptap/react";

export function HelpArticleToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "hcCallout",
              attrs: { variant: "info" },
              content: [{ type: "paragraph" }],
            })
            .run()
        }
      >
        Info box
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "hcCallout",
              attrs: { variant: "warning" },
              content: [{ type: "paragraph" }],
            })
            .run()
        }
      >
        Warning
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "hcCallout",
              attrs: { variant: "tip" },
              content: [{ type: "paragraph" }],
            })
            .run()
        }
      >
        Tip
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "hcSteps",
              content: [
                {
                  type: "hcStep",
                  attrs: { title: "Step 1" },
                  content: [{ type: "paragraph" }],
                },
              ],
            })
            .run()
        }
      >
        Steps
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "hcDetails",
              attrs: { summary: "Show more" },
              content: [{ type: "paragraph" }],
            })
            .run()
        }
      >
        Collapse
      </Button>
    </div>
  );
}
