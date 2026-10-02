import { describe, expect, it } from "vitest";
import { extensionForMime, isAllowedImMime } from "./mime.js";

describe("IM attachment MIME policy", () => {
  it.each([
    ["application/vnd.ms-excel", ".xls"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
    ["application/vnd.ms-powerpoint", ".ppt"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
    ["application/rtf", ".rtf"],
    ["application/json; charset=utf-8", ".json"],
  ])("accepts supported business document MIME %s", (mime, extension) => {
    expect(isAllowedImMime(mime)).toBe(true);
    expect(extensionForMime(mime)).toBe(extension);
  });

  it("still rejects executable content", () => {
    expect(isAllowedImMime("application/x-sh")).toBe(false);
  });
});
