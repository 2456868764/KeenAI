import type { ApiEnv, GenerateImageInput } from "@keenai/shared";
import type { AppVariables } from "../../types.js";
import { insertAttachment } from "../attachments.js";
import { generateImage } from "../media/generate-image.js";
import { generateStorageKey, saveUploadFile } from "../uploads.js";

type Db = AppVariables["store"]["db"];

export type GenerateImageToolResult = {
  attachmentId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  provider: "stub" | "openai";
  /** Markdown for agentOutboundText on POST .../messages */
  agentOutboundText: string;
};

export async function runGenerateImageTool(
  db: Db,
  env: ApiEnv,
  orgId: string,
  input: GenerateImageInput,
): Promise<GenerateImageToolResult> {
  const generated = await generateImage(env, {
    prompt: input.prompt,
    size: input.size,
  });

  const ext = generated.fileName.includes(".")
    ? generated.fileName.slice(generated.fileName.lastIndexOf("."))
    : ".png";
  const storageKey = generateStorageKey(ext);
  await saveUploadFile(env, storageKey, generated.data);

  const attachment = await insertAttachment(db, {
    orgId,
    storageKey,
    fileName: generated.fileName,
    contentType: generated.contentType,
    sizeBytes: generated.data.byteLength,
    metadata: { source: "agent_tool" },
  });

  const alt = input.alt?.trim();
  const agentOutboundText = alt ? `${alt}\nMEDIA:${storageKey}` : `MEDIA:${storageKey}`;

  return {
    attachmentId: attachment.id,
    storageKey,
    contentType: generated.contentType,
    sizeBytes: generated.data.byteLength,
    provider: generated.provider,
    agentOutboundText,
  };
}
