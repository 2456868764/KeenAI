import type { ApiEnv } from "@keenai/shared";

export type GenerateImageResult = {
  data: Uint8Array;
  contentType: string;
  fileName: string;
  provider: "stub" | "openai";
};

const STUB_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/** Generate an image from a text prompt (stub PNG by default; OpenAI when configured). */
export async function generateImage(
  env: ApiEnv,
  input: { prompt: string; size?: string },
): Promise<GenerateImageResult> {
  const provider = resolveImageGenProvider(env);
  if (provider === "openai") {
    return generateWithOpenAi(env, input);
  }

  return {
    data: STUB_PNG,
    contentType: "image/png",
    fileName: "generated.png",
    provider: "stub",
  };
}

function resolveImageGenProvider(env: ApiEnv): "stub" | "openai" {
  if (env.IMAGE_GEN_PROVIDER === "openai" && env.OPENAI_API_KEY) return "openai";
  if (env.IMAGE_GEN_PROVIDER === "stub") return "stub";
  return env.OPENAI_API_KEY ? "openai" : "stub";
}

async function generateWithOpenAi(
  env: ApiEnv,
  input: { prompt: string; size?: string },
): Promise<GenerateImageResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_api_key_required");

  const size = input.size ?? defaultImageSize(env.OPENAI_IMAGE_MODEL);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL,
      prompt: input.prompt,
      n: 1,
      size,
      response_format: "b64_json",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`image_gen_failed:${res.status}:${detail.slice(0, 200)}`);
  }

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("image_gen_empty");

  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (data.byteLength === 0) throw new Error("image_gen_empty");

  return {
    data,
    contentType: "image/png",
    fileName: "generated.png",
    provider: "openai",
  };
}

function defaultImageSize(model: string): string {
  if (model.startsWith("dall-e-3")) return "1024x1024";
  return "1024x1024";
}
