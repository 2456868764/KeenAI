import { draftRequestHasImages } from "../prompts.js";
import type { DraftProvider, DraftRequest, DraftStreamChunk } from "../types.js";

function buildStubDraft(req: DraftRequest): string {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const snippet = lastUser?.plainText?.trim().slice(0, 120) || "your request";
  const instruction = req.instruction?.trim();
  const intro = instruction
    ? `Following your note (${instruction}), `
    : "Thank you for reaching out. ";
  const visionNote = draftRequestHasImages(req) ? "I reviewed the image(s) you shared. " : "";

  return `${intro}${visionNote}Regarding "${snippet}", we're reviewing this and will follow up shortly.\n\nIf you have any other details to share, please reply here.\n\nBest regards,\nSupport Team`;
}

export const stubDraftProvider: DraftProvider = {
  id: "stub" as const,

  async *streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk> {
    const text = buildStubDraft(req);
    const step = 12;
    for (let i = 0; i < text.length; i += step) {
      yield { type: "text-delta", text: text.slice(i, i + step) };
    }
    yield { type: "done" };
  },
};
