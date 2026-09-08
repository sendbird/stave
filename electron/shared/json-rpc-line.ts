/**
 * Extracts safe JSON-RPC envelope metadata (method, item type/id) from the
 * leading characters of a dropped oversized stdout line. Never returns
 * payload content — diagnostics only.
 */
export function describeJsonRpcLinePrefix(linePrefix: string) {
  const method = /"method"\s*:\s*"([^"]{1,128})"/.exec(linePrefix)?.[1];
  const itemType = /"item"\s*:\s*\{[^{}]*?"type"\s*:\s*"([^"]{1,64})"/.exec(
    linePrefix,
  )?.[1];
  const itemId = /"item"\s*:\s*\{[^{}]*?"id"\s*:\s*"([^"]{1,128})"/.exec(
    linePrefix,
  )?.[1];
  // For responses ({"jsonrpc":"2.0","id":5,"result":...}) the first "id" is
  // the envelope id. Only trust it when no "method" is present (i.e. this is
  // a response, not a notification whose first "id" may belong to an item).
  let responseId: number | string | null = null;
  if (!method) {
    const idMatch = /"id"\s*:\s*(?:(\d+)|"([^"]{1,128})")/.exec(linePrefix);
    if (idMatch) {
      responseId = idMatch[1] !== undefined ? Number(idMatch[1]) : idMatch[2]!;
    }
  }
  return {
    method: method ?? null,
    itemType: itemType ?? null,
    itemId: itemId ?? null,
    responseId,
  };
}
