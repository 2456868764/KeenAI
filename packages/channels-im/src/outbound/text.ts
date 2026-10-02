export function splitOutboundText(text: string | undefined, maxCharacters: number): string[] {
  if (!text) return [];
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
    throw new Error("outbound_text_limit_invalid");
  }
  const characters = Array.from(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < characters.length; offset += maxCharacters) {
    chunks.push(characters.slice(offset, offset + maxCharacters).join(""));
  }
  return chunks;
}
