import { z } from "zod";
import type { NormalizedProviderEvent } from "./provider.types";

export const ProviderActivityEventSchema = z.object({
  type: z.literal("provider_activity"),
  activity: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("retry") }),
    z.object({ kind: z.literal("background"), count: z.number().int().nonnegative() }),
    z.object({ kind: z.literal("transport_exit") }),
  ]),
});
export type ProviderActivityEvent = z.infer<typeof ProviderActivityEventSchema>;

const elapsedMs = z.number().int().nonnegative();
export const TurnStallEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["approval", "user_input", "retry", "transport_exit", "silence"]) }),
  z.object({ kind: z.literal("tool"), name: z.string().max(200), elapsedMs }),
  z.object({ kind: z.literal("background"), count: z.number().int().positive() }),
]);
export type TurnStallEvidence = z.infer<typeof TurnStallEvidenceSchema>;
export const TurnStallDecisionSchema = z.enum(["wait", "warn", "offer_continuation", "abort"]);
export type TurnStallDecision = z.infer<typeof TurnStallDecisionSchema>;

export const TURN_STALL_WARNING_MS = 5 * 60_000;
export const TURN_STALL_GRACE_MS = 15 * 60_000;
export const TURN_STALL_HARD_LIMIT_MS = 60 * 60_000;

interface ActiveTool {
  id: string;
  name: string;
  startedAt: number;
}

export interface ProviderActivityEvidence {
  tools?: readonly ActiveTool[];
  retrying?: boolean;
  backgroundCount?: number;
  transportExited?: boolean;
}

export function observeProviderActivity(
  previous: ProviderActivityEvidence | undefined,
  event: NormalizedProviderEvent,
  now: number,
): ProviderActivityEvidence | undefined {
  if (event.type === "provider_activity") {
    switch (event.activity.kind) {
      case "retry":
        return { ...previous, retrying: true };
      case "background":
        return { ...previous, backgroundCount: event.activity.count };
      case "transport_exit":
        return { transportExited: true };
    }
  }
  if (event.type === "done") return undefined;
  const tools = previous?.tools ?? [];
  if (event.type === "tool" || event.type === "tool_progress" || event.type === "tool_result") {
    const id = event.type === "tool_result" ? event.tool_use_id : event.toolUseId;
    if (!id) return previous;
    const current = tools.find((tool) => tool.id === id);
    const finished = event.type === "tool_result" ? !event.isPartial :
      event.type === "tool" && (event.state === "output-available" || event.state === "output-error");
    if (finished) {
      return current ? { ...previous, tools: tools.filter((tool) => tool.id !== id) } : previous;
    }
    if (current || event.type === "tool_result" || (event.type === "tool" && event.state !== "input-available")) {
      return previous;
    }
    const startedAt = event.type === "tool_progress"
      ? now - event.elapsedSeconds * 1000
      : event.startedAt ?? now;
    return {
      ...previous,
      tools: [...tools, { id, name: event.toolName.slice(0, 200), startedAt }].slice(-64),
      ...(event.type === "tool" && previous?.retrying ? { retrying: false } : {}),
    };
  }
  // Metadata and background tool output do not establish API recovery.
  if (previous?.retrying && (event.type === "text" || event.type === "thinking")) {
    return { ...previous, retrying: false };
  }
  return previous;
}

export function resolveTurnStallEvidence(
  activity: ProviderActivityEvidence | undefined,
  pending: "approval" | "user_input" | null,
  now: number,
): TurnStallEvidence {
  if (pending) return { kind: pending };
  if (activity?.transportExited) return { kind: "transport_exit" };
  if (activity?.retrying) return { kind: "retry" };
  const tool = activity?.tools?.[0];
  if (tool) return { kind: "tool", name: tool.name, elapsedMs: Math.max(0, Math.round(now - tool.startedAt)) };
  if (activity?.backgroundCount) return { kind: "background", count: activity.backgroundCount };
  return { kind: "silence" };
}

export function decideTurnStall(evidence: TurnStallEvidence, silentMs: number): {
  decision: TurnStallDecision;
  recheckAfterMs?: number;
} {
  const ordinaryLimit = TURN_STALL_WARNING_MS + TURN_STALL_GRACE_MS;
  switch (evidence.kind) {
    case "approval":
    case "user_input":
      return { decision: "wait", recheckAfterMs: TURN_STALL_WARNING_MS };
    case "transport_exit":
      return { decision: "abort" };
    case "silence":
      return silentMs >= ordinaryLimit
        ? { decision: "abort" }
        : { decision: "offer_continuation", recheckAfterMs: ordinaryLimit - silentMs };
    default:
      if (silentMs >= TURN_STALL_HARD_LIMIT_MS) return { decision: "abort" };
      if (silentMs >= ordinaryLimit) return { decision: "warn", recheckAfterMs: TURN_STALL_HARD_LIMIT_MS - silentMs };
      return { decision: "wait", recheckAfterMs: ordinaryLimit - silentMs };
  }
}
