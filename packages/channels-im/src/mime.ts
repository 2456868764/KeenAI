const ALLOWED_PREFIXES = ["image/", "audio/", "video/", "text/"] as const;
const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "application/json",
  "application/x-tgsticker",
]);

export function isAllowedImMime(contentType: string | null | undefined): boolean {
  const mime = contentType?.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!mime) return false;
  if (ALLOWED_EXACT.has(mime)) return true;
  return ALLOWED_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export function extensionForMime(contentType: string): string {
  const mime = contentType.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("wordprocessingml")) return ".docx";
  if (mime.includes("msword")) return ".doc";
  if (mime.includes("spreadsheetml")) return ".xlsx";
  if (mime.includes("ms-excel")) return ".xls";
  if (mime.includes("presentationml")) return ".pptx";
  if (mime.includes("ms-powerpoint")) return ".ppt";
  if (mime.includes("rtf")) return ".rtf";
  if (mime.includes("json")) return ".json";
  if (mime.includes("tgsticker")) return ".tgs";
  return ".bin";
}

export function defaultFileName(contentType: string, platformRef: string): string {
  const ext = extensionForMime(contentType);
  const shortRef = platformRef.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "");
  return `im-${shortRef || "file"}${ext}`;
}
