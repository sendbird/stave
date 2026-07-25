/**
 * Shared shape guards for untyped Codex app-server JSON-RPC payloads.
 *
 * Extracted verbatim from `codex-app-server-runtime.ts` so the runtime and its
 * sibling mapping modules use one implementation; no behavior changed.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
