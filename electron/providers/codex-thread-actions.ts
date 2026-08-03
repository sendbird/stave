import type { CodexThreadForkResponse } from "../../src/lib/providers/provider.types";

export function mapCodexThreadForkResponse(
  response: unknown,
): CodexThreadForkResponse {
  const payload =
    response && typeof response === "object"
      ? (response as {
          thread?: { id?: unknown; turns?: unknown };
          threadId?: unknown;
        })
      : {};
  const turnIds = Array.isArray(payload.thread?.turns)
    ? payload.thread.turns.flatMap((turn: unknown) => {
        const id =
          turn && typeof turn === "object" && "id" in turn
            ? (turn as { id?: unknown }).id
            : null;
        return typeof id === "string" ? [id] : [];
      })
    : [];
  return {
    ok: true,
    detail: "Forked Codex thread.",
    threadId:
      typeof payload.thread?.id === "string"
        ? payload.thread.id
        : typeof payload.threadId === "string"
          ? payload.threadId
          : undefined,
    ...(turnIds.length > 0 ? { turnIds } : {}),
  };
}
