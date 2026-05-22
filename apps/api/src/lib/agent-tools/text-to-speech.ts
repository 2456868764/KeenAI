import type { ApiEnv, TextToSpeechInput } from "@keenai/shared";
import type { AppVariables } from "../../types.js";
import { insertAttachment } from "../attachments.js";
import { synthesizeSpeech } from "../media/tts.js";
import { generateStorageKey, saveUploadFile } from "../uploads.js";

type Db = AppVariables["store"]["db"];

export type TextToSpeechToolResult = {
  attachmentId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  provider: "stub" | "openai";
  /** Markdown for agentOutboundText on POST .../messages */
  agentOutboundText: string;
};

export async function runTextToSpeechTool(
  db: Db,
  env: ApiEnv,
  orgId: string,
  input: TextToSpeechInput,
): Promise<TextToSpeechToolResult> {
  const synthesized = await synthesizeSpeech(env, {
    text: input.text,
    voice: input.voice,
  });

  const ext = synthesized.fileName.includes(".")
    ? synthesized.fileName.slice(synthesized.fileName.lastIndexOf("."))
    : ".wav";
  const storageKey = generateStorageKey(ext);
  await saveUploadFile(env, storageKey, synthesized.data);

  const attachment = await insertAttachment(db, {
    orgId,
    storageKey,
    fileName: synthesized.fileName,
    contentType: synthesized.contentType,
    sizeBytes: synthesized.data.byteLength,
    metadata: { source: "agent_tool" },
  });

  const mediaLine = `MEDIA:${storageKey}`;
  const agentOutboundText =
    input.asVoice === false ? mediaLine : `${mediaLine}\n[[audio_as_voice]]`;

  return {
    attachmentId: attachment.id,
    storageKey,
    contentType: synthesized.contentType,
    sizeBytes: synthesized.data.byteLength,
    provider: synthesized.provider,
    agentOutboundText,
  };
}
