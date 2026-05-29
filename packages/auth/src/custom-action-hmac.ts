import { createHmac } from "node:crypto";

export const DEFAULT_CUSTOM_ACTION_SIGNATURE_HEADER = "x-keenai-signature";

export type SignCustomActionRequestInput = {
  secret: string;
  method: string;
  url: string;
  body?: string;
  timestamp?: number;
  headerName?: string;
};

export type SignCustomActionRequestResult = {
  headerName: string;
  headerValue: string;
  timestamp: number;
};

/** HMAC-SHA256 request signing for outbound Custom Action HTTP calls. */
export function signCustomActionRequest(
  input: SignCustomActionRequestInput,
): SignCustomActionRequestResult {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const body = input.body ?? "";
  const payload = `${input.method.toUpperCase()}\n${input.url}\n${timestamp}\n${body}`;
  const signature = createHmac("sha256", input.secret).update(payload, "utf8").digest("hex");
  const headerName = input.headerName ?? DEFAULT_CUSTOM_ACTION_SIGNATURE_HEADER;

  return {
    headerName,
    headerValue: `t=${timestamp},v1=${signature}`,
    timestamp,
  };
}
