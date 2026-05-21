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
    .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.plainText}`)
    .join("\n");

  const prompt = `Conversation subject: ${req.subject ?? "(none)"}\n\n${transcript}\n\nDraft the next agent reply:`;

  return { system, prompt };
}
