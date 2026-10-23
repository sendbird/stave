/**
 * Approval and question parts only move forward: requested, then interrupted
 * (the turn ended without an answer), then answered (responded or denied).
 * When two copies of the same message disagree, each request keeps the most
 * advanced state either copy holds, so an answer given in either copy
 * survives a stale copy, including one a stop marked as interrupted. Shared by
 * the persistence guard and the renderer page merge.
 */
const STATE_RANK: Record<"approval" | "user_input", Record<string, number>> = {
  approval: {
    "approval-requested": 0,
    "approval-interrupted": 1,
    "approval-responded": 2,
    "output-denied": 2,
  },
  user_input: {
    "input-requested": 0,
    "input-interrupted": 1,
    "input-responded": 2,
    "input-denied": 2,
  },
};
const ANSWERED_RANK = 2;

interface InteractionPartLike {
  type: "approval" | "user_input";
  requestId: string;
  state?: unknown;
}

function isInteractionPart(part: unknown): part is InteractionPartLike {
  if (!part || typeof part !== "object") {
    return false;
  }
  const candidate = part as { type?: unknown; requestId?: unknown };
  return (
    (candidate.type === "approval" || candidate.type === "user_input") &&
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0
  );
}

/** Rank of a known state; unknown or missing states rank below every known one. */
function stateRank(part: InteractionPartLike) {
  return typeof part.state === "string"
    ? (STATE_RANK[part.type][part.state] ?? -1)
    : -1;
}

/** Whether any approval or question in `parts` has no answer yet. */
export function hasUnansweredInteraction(parts: readonly unknown[]) {
  return parts.some(
    (part) => isInteractionPart(part) && stateRank(part) < ANSWERED_RANK,
  );
}

/**
 * Returns `target` with every interaction replaced by the version `source`
 * holds for the same request when that version is further along. `carried` is
 * 0 and `parts` is `target` itself when nothing moved.
 */
export function carryForwardInteractionAnswers<Part>(args: {
  target: readonly Part[];
  source: readonly unknown[];
}): { parts: Part[]; carried: number } {
  const furthestByRequest = new Map<string, { part: Part; rank: number }>();
  for (const part of args.source) {
    if (!isInteractionPart(part)) {
      continue;
    }
    const rank = stateRank(part);
    if (rank < 0) {
      continue;
    }
    const key = `${part.type}:${part.requestId}`;
    const current = furthestByRequest.get(key);
    if (!current || rank > current.rank) {
      furthestByRequest.set(key, { part: part as Part, rank });
    }
  }
  if (furthestByRequest.size === 0) {
    return { parts: args.target as Part[], carried: 0 };
  }
  let carried = 0;
  const parts = args.target.map((part) => {
    if (!isInteractionPart(part)) {
      return part;
    }
    const furthest = furthestByRequest.get(`${part.type}:${part.requestId}`);
    if (!furthest || furthest.rank <= stateRank(part)) {
      return part;
    }
    carried += 1;
    return furthest.part;
  });
  return carried > 0
    ? { parts, carried }
    : { parts: args.target as Part[], carried: 0 };
}
