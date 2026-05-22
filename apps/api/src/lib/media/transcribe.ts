import type { ApiEnv } from "@keenai/shared";

export type TranscribeResult = {
  transcript: string;
  provider: "stub" | "openai";
};

/** Transcribe audio bytes to text (stub by default; OpenAI Whisper when configured). */
export async function transcribeAudio(
  env: ApiEnv,
  input: { data: Uint8Array; contentType: string; fileName?: string | null },
): Promise<TranscribeResult> {
  const provider = resolveSttProvider(env);
  if (provider === "openai") {
    const transcript = await transcribeWithOpenAi(env, input);
    return { transcript, provider: "openai" };
  }

  const label = input.fileName?.trim() || "voice message";
  return {
    transcript: `[Transcript stub] Customer said something about "${label}" (${input.data.byteLength} bytes).`,
    provider: "stub",
  };
}

function resolveSttProvider(env: ApiEnv): "stub" | "openai" {
  if (env.STT_PROVIDER === "openai" && env.OPENAI_API_KEY) return "openai";
  if (env.STT_PROVIDER === "stub") return "stub";
  return env.OPENAI_API_KEY ? "openai" : "stub";
}

async function transcribeWithOpenAi(
  env: ApiEnv,
  input: { data: Uint8Array; contentType: string; fileName?: string | null },
): Promise<string> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_api_key_required");

  const ext = extensionForMime(input.contentType);
  const fileName = input.fileName?.trim() || `audio.${ext}`;
  const form = new FormData();
  form.append("model", env.OPENAI_WHISPER_MODEL);
  form.append(
    "file",
    new Blob([new Uint8Array(input.data)], { type: input.contentType }),
    fileName,
  );

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`whisper_failed:${res.status}:${detail.slice(0, 200)}`);
  }

  const body = (await res.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) throw new Error("whisper_empty_transcript");
  return text;
}

function extensionForMime(contentType: string): string {
  const mime = contentType.toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "bin";
}
