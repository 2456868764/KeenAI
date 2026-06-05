import { describe, expect, it } from "vitest";
import { extractAttachmentIdsFromTiptapDoc } from "./tiptap-attachments.js";

describe("extractAttachmentIdsFromTiptapDoc", () => {
  it("reads attachmentId attrs and content URLs from image nodes", () => {
    const ids = extractAttachmentIdsFromTiptapDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "image",
              attrs: {
                attachmentId: "att-1",
                src: "http://localhost/api/v1/attachments/att-2/content",
              },
            },
          ],
        },
      ],
    });
    expect(ids).toEqual(["att-1", "att-2"]);
  });
});
