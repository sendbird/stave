/**
 * Approval and question parts move one way: from a requested state to a
 * terminal one (responded, interrupted, denied). When two copies of the same
 * message disagree, a terminal state is never replaced and a requested one
 * takes the other copy's terminal state, so an answer given in either copy
 * survives. Shared by the persistence guard and the renderer page merge.
 */
const REQUESTED_STATE = {
  approval: "approval-requested",
  user_input: "input-requested",
} as const;
const TERMINAL_STATES = {
  approval: new Set(["approval-responded", "approval-interrupted", "output-denied"]),
  user_input: new Set(["input-responded", "input-interrupted", "input-denied"]),
} as const;

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

function isRequested(part: InteractionPartLike) {
  return part.state === REQUESTED_STATE[part.type];
}

function isTerminal(part: InteractionPartLike) {
  return typeof part.state === "string" && TERMINAL_STATES[part.type].has(part.state);
}

/** Whether any approval or question in `parts` still waits for an answer. */
export function hasRequestedInteraction(parts: readonly unknown[]) {
  return parts.some((part) => isInteractionPart(part) && isRequested(part));
}

/**
 * Returns `target` with every still-requested interaction replaced by the
 * terminal version `source` holds for the same request. `carried` is 0 and
 * `parts` is `target` itself when nothing moved.
 */
export function carryForwardInteractionAnswers<Part>(args: {
  target: readonly Part[];
  source: readonly unknown[];
}): { parts: Part[]; carried: number } {
  const answeredByRequest = new Map<string, Part>();
  for (const part of args.source) {
    if (isInteractionPart(part) && isTerminal(part)) {
      answeredByRequest.set(`${part.type}:${part.requestId}`, part as Part);
    }
  }
  if (answeredByRequest.size === 0) {
    return { parts: args.target as Part[], carried: 0 };
  }
  let carried = 0;
  const parts = args.target.map((part) => {
    if (!isInteractionPart(part) || !isRequested(part)) {
      return part;
    }
    const answered = answeredByRequest.get(`${part.type}:${part.requestId}`);
    if (!answered) {
      return part;
    }
    carried += 1;
    return answered;
  });
  return carried > 0
    ? { parts, carried }
    : { parts: args.target as Part[], carried: 0 };
}
