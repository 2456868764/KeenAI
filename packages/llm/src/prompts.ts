import type { DraftRequest } from "./types.js";

export function buildDraftPrompt(req: DraftRequest): { system: string; prompt: string } {
  const system = [
    "You are a helpful customer support agent drafting a reply.",
    "Be concise, professional, and empathetic.",
    "Output only the reply body — no subject line.",
    req.instruction ? `Agent instruction: ${req.instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const transcript = req.messages
    .map((m) => {
      const imageNote =
        m.images && m.images.length > 0 ? ` [${m.images.length} image(s) attached]` : "";
      return `${m.role === "user" ? "Customer" : "Agent"}: ${m.plainText}${imageNote}`;
    })
    .join("\n");

  const prompt = `Conversation subject: ${req.subject ?? "(none)"}\n\n${transcript}\n\nDraft the next agent reply:`;

  return { system, prompt };
}

type VisionUserContent = Array<
  { type: "text"; text: string } | { type: "image"; image: Uint8Array; mimeType?: string }
>;

type VisionMessage =
  | { role: "user"; content: VisionUserContent }
  | { role: "assistant"; content: Array<{ type: "text"; text: string }> };

export type DraftStreamInput =
  | { mode: "prompt"; system: string; prompt: string }
  | { mode: "messages"; system: string; messages: VisionMessage[] };

function decodeBase64(dataBase64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(dataBase64, "base64"));
  }
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function buildDraftStreamInput(req: DraftRequest): DraftStreamInput {
  const hasImages = req.messages.some((m) => m.images && m.images.length > 0);
  if (!hasImages) {
    const { system, prompt } = buildDraftPrompt(req);
    return { mode: "prompt", system, prompt };
  }

  const { system } = buildDraftPrompt(req);
  const messages: VisionMessage[] = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const text = m.plainText.trim();
      if (m.role !== "user") {
        const imageNote =
          m.images && m.images.length > 0 ? ` [${m.images.length} image(s) attached]` : "";
        return {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: (text || "(empty)") + imageNote }],
        };
      }

      const parts: VisionUserContent = [];
      if (text) parts.push({ type: "text", text });
      for (const image of m.images ?? []) {
        parts.push({
          type: "image",
          image: decodeBase64(image.dataBase64),
          mimeType: image.mimeType,
        });
      }
      if (parts.length === 0) parts.push({ type: "text", text: "(empty)" });
      return { role: "user" as const, content: parts };
    });

  return { mode: "messages", system, messages };
}

export function draftRequestHasImages(req: DraftRequest): boolean {
  return req.messages.some((m) => m.images && m.images.length > 0);
}
