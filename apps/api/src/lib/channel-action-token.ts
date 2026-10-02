import { createHmac, timingSafeEqual } from "node:crypto";

export type ChannelWorkflowButtonToken = {
  orgId: string;
  conversationId: string;
  workflowRunId: string;
  blockId: string;
  buttonId: string;
  expiresAt: number;
};

export function signChannelWorkflowButton(
  payload: Omit<ChannelWorkflowButtonToken, "expiresAt"> & { expiresAt?: number },
  secret: string,
): string {
  const encoded = Buffer.from(
    JSON.stringify({ ...payload, expiresAt: payload.expiresAt ?? Date.now() + 24 * 60 * 60_000 }),
  ).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyChannelWorkflowButton(
  token: string,
  secret: string,
  now = Date.now(),
): ChannelWorkflowButtonToken | null {
  const [encoded, providedSignature, extra] = token.split(".");
  if (!encoded || !providedSignature || extra) return null;
  const expected = signature(encoded, secret);
  const provided = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    provided.byteLength !== expectedBuffer.byteLength ||
    !timingSafeEqual(provided, expectedBuffer)
  ) {
    return null;
  }
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      !stringValue(value.orgId) ||
      !stringValue(value.conversationId) ||
      !stringValue(value.workflowRunId) ||
      !stringValue(value.blockId) ||
      !stringValue(value.buttonId) ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt < now
    ) {
      return null;
    }
    return value as ChannelWorkflowButtonToken;
  } catch {
    return null;
  }
}

function signature(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
