import type { ApiEnv } from "@keenai/shared";

export type SynthesizeSpeechResult = {
  data: Uint8Array;
  contentType: string;
  fileName: string;
  provider: "stub" | "openai";
};

/** Synthesize speech from text (stub WAV by default; OpenAI TTS when configured). */
export async function synthesizeSpeech(
  env: ApiEnv,
  input: { text: string; voice?: string },
): Promise<SynthesizeSpeechResult> {
  const provider = resolveTtsProvider(env);
  if (provider === "openai") {
    return synthesizeWithOpenAi(env, input);
  }

  const fileName = "speech.wav";
  return {
    data: stubWavBytes(),
    contentType: "audio/wav",
    fileName,
    provider: "stub",
  };
}

function resolveTtsProvider(env: ApiEnv): "stub" | "openai" {
  if (env.TTS_PROVIDER === "openai" && env.OPENAI_API_KEY) return "openai";
  if (env.TTS_PROVIDER === "stub") return "stub";
  return env.OPENAI_API_KEY ? "openai" : "stub";
}

async function synthesizeWithOpenAi(
  env: ApiEnv,
  input: { text: string; voice?: string },
): Promise<SynthesizeSpeechResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_api_key_required");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_TTS_MODEL,
      input: input.text,
      voice: input.voice ?? env.OPENAI_TTS_VOICE,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`tts_failed:${res.status}:${detail.slice(0, 200)}`);
  }

  const buffer = await res.arrayBuffer();
  const data = new Uint8Array(buffer);
  if (data.byteLength === 0) throw new Error("tts_empty_audio");

  return {
    data,
    contentType: "audio/mpeg",
    fileName: "speech.mp3",
    provider: "openai",
  };
}

/** Minimal valid mono 8 kHz WAV (short silence) for stub TTS. */
function stubWavBytes(): Uint8Array {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate / 10;
  const dataSize = numSamples * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
