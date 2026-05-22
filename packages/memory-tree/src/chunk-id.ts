import { createHash } from "node:crypto";

/** Deterministic content-addressed chunk id (sha256 hex). */
export function computeMemoryChunkId(
  orgId: string,
  brandId: string,
  sourceRef: string,
  bodyMd: string,
): string {
  const payload = `${orgId}\n${brandId}\n${sourceRef}\n${bodyMd}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
