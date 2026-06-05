/** Lexical Jaccard similarity for feedback post dedup (P2-12). */
export function textSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let inter = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) inter++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return inter / union;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}
