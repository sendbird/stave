import { i18n } from "@/i18n";
import {
  isSubagentToolName,
  resolveToolTitle,
} from "@/lib/providers/subagent-identity";
import { isTodoToolName } from "@/lib/providers/tool-activity";
import {
  resolveGeneralToolDetail,
  resolveToolDetail,
} from "@/lib/providers/turn-status";
import { computePromptCacheStats } from "@/lib/providers/usage-cache";
import type { ChatMessage, MessagePart, ToolUsePart } from "@/types/chat";

/**
 * A turn as spans on one time axis: the turn itself, the reasoning passes and
 * tool calls in it, and the subagents with the calls they made.
 *
 * Only observed times are drawn. A tool call's start and end are the times the
 * runtime saw them (`ToolUsePart.startedAt` / `completedAt`); a reasoning pass
 * keeps the times its part was opened and closed while the turn streamed.
 * Anything without both — every call saved before runtimes recorded times, a
 * call the turn ended before it finished — is listed as "time not reported"
 * instead of being placed somewhere plausible. A call still running in a live
 * turn is drawn open to "now", which is a time that was observed.
 */

export type TurnTraceKind = "turn" | "model" | "tool" | "agent";
export type TurnTraceStatus = "ok" | "error" | "running";

export interface TurnTraceSpan {
  id: string;
  /** Null for the turn itself; every other span hangs off a drawn span. */
  parentId: string | null;
  kind: TurnTraceKind;
  label: string;
  detail?: string;
  startMs: number;
  /** Null while still running: drawn to the trace's `nowMs`. */
  endMs: number | null;
  status: TurnTraceStatus;
  toolUseId?: string;
}

export interface TurnTraceUnreported {
  id: string;
  kind: Exclude<TurnTraceKind, "turn">;
  label: string;
  detail?: string;
  toolUseId?: string;
}

export interface TurnTraceUsage {
  /** Prompt tokens read (cached or not) plus output tokens, when reported. */
  tokens?: number;
  /** Only providers that report a price (Claude). */
  costUsd?: number;
}

export interface TurnTrace {
  spans: TurnTraceSpan[];
  unreported: TurnTraceUnreported[];
  /** The longest leaf span (no children, not the turn), when there are two or more. */
  slowestId: string | null;
  /** The "now" line; present only while the turn runs. */
  nowMs: number | null;
  usage: TurnTraceUsage;
}

export type TurnTraceMessage = Pick<ChatMessage, "role" | "parts"> &
  Partial<Pick<ChatMessage, "usage" | "providerId">>;

function parseObserved(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTerminalToolState(state: ToolUsePart["state"]) {
  return state === "output-available" || state === "output-error";
}

function describeTool(part: ToolUsePart) {
  const isAgent = isSubagentToolName(part.toolName);
  const label = resolveToolTitle(part.toolName, part.input, undefined, { isSubagent: isAgent });
  const detail = isAgent ? resolveToolDetail(part.input) : resolveGeneralToolDetail(part.input);
  return { isAgent, label, detail: detail && detail !== label ? detail : undefined };
}

function sumUsage(messages: readonly TurnTraceMessage[]): TurnTraceUsage {
  let tokens = 0;
  let tokensReported = false;
  let costUsd = 0;
  let costReported = false;
  for (const message of messages) {
    const usage = message.usage;
    if (!usage) continue;
    const prompt = computePromptCacheStats({
      providerId: message.providerId && message.providerId !== "user" ? message.providerId : null,
      usage,
    }).promptTokens;
    const counted = prompt + (usage.outputTokens ?? 0);
    if (counted > 0) {
      tokens += counted;
      tokensReported = true;
    }
    if (usage.totalCostUsd != null) {
      costUsd += usage.totalCostUsd;
      costReported = true;
    }
  }
  return {
    ...(tokensReported ? { tokens } : {}),
    ...(costReported ? { costUsd } : {}),
  };
}

export const TURN_TRACE_ROOT_ID = "turn";

export function buildTurnTrace(args: {
  /** The turn's own messages, oldest first. */
  messages: readonly TurnTraceMessage[];
  turnStartedAt: number;
  /** When the turn ended; null while it runs or when its end was not saved. */
  turnCompletedAt: number | null;
  /** The turn is still running: open spans are drawn to `now`. */
  live: boolean;
  /** The clock a running span is drawn to. */
  now: number;
  /** The turn ended in failure. */
  failed?: boolean;
}): TurnTrace {
  const live = args.live;
  const nowMs = live ? Math.max(args.now, args.turnStartedAt) : null;
  const root: TurnTraceSpan = {
    id: TURN_TRACE_ROOT_ID,
    parentId: null,
    kind: "turn",
    label: i18n.t("session:turnTrace.turn"),
    startMs: args.turnStartedAt,
    endMs: live
      ? null
      : Math.max(args.turnCompletedAt ?? args.turnStartedAt, args.turnStartedAt),
    status: live ? "running" : args.failed ? "error" : "ok",
  };
  const spans: TurnTraceSpan[] = [root];
  const unreported: TurnTraceUnreported[] = [];

  const parts: MessagePart[] = [];
  for (const message of args.messages) {
    if (message.role === "assistant") parts.push(...message.parts);
  }
  const toolParts = parts.filter(
    (part): part is ToolUsePart => part.type === "tool_use" && !isTodoToolName(part.toolName),
  );
  // Codex names a spawned worker by thread id on the spawning call, and the
  // worker's own calls by that id as their owner.
  const spawnSpanIdByAgentId = new Map<string, string>();
  for (const part of toolParts) {
    if (part.agentId && part.toolUseId) {
      spawnSpanIdByAgentId.set(part.agentId, `tool:${part.toolUseId}`);
    }
  }

  let reasoningIndex = 0;
  const drawnToolSpans: Array<{ span: TurnTraceSpan; part: ToolUsePart }> = [];
  for (const [index, part] of parts.entries()) {
    if (part.type === "thinking") {
      reasoningIndex += 1;
      const id = `model:${reasoningIndex}`;
      const label = i18n.t("session:turnTrace.reasoning");
      const startMs = parseObserved(part.startedAt);
      const endMs = parseObserved(part.completedAt);
      const running = live && part.isStreaming && startMs !== null;
      // A pass that arrived whole was opened and closed in one moment: its
      // length was never observed, so it is not drawn as an instant.
      if (startMs === null || (!running && (endMs === null || endMs <= startMs))) {
        unreported.push({ id, kind: "model", label });
        continue;
      }
      spans.push({
        id,
        parentId: TURN_TRACE_ROOT_ID,
        kind: "model",
        label,
        startMs,
        endMs: running ? null : endMs,
        status: running ? "running" : "ok",
      });
      continue;
    }
    if (part.type !== "tool_use" || isTodoToolName(part.toolName)) continue;
    const id = part.toolUseId ? `tool:${part.toolUseId}` : `tool-part:${index}`;
    const { isAgent, label, detail } = describeTool(part);
    const kind: TurnTraceKind = isAgent ? "agent" : "tool";
    const startMs = parseObserved(part.startedAt);
    const endMs = parseObserved(part.completedAt);
    const running = live && !isTerminalToolState(part.state) && startMs !== null && endMs === null;
    if (startMs === null || (endMs === null && !running)) {
      unreported.push({
        id,
        kind,
        label,
        ...(detail ? { detail } : {}),
        ...(part.toolUseId ? { toolUseId: part.toolUseId } : {}),
      });
      continue;
    }
    const span: TurnTraceSpan = {
      id,
      parentId: TURN_TRACE_ROOT_ID,
      kind,
      label,
      ...(detail ? { detail } : {}),
      startMs,
      endMs: running ? null : Math.max(endMs ?? startMs, startMs),
      status: part.state === "output-error" ? "error" : running ? "running" : "ok",
      ...(part.toolUseId ? { toolUseId: part.toolUseId } : {}),
    };
    spans.push(span);
    drawnToolSpans.push({ span, part });
  }

  // Nest each call under the agent that made it, when that agent is drawn.
  const drawnIds = new Set(spans.map((span) => span.id));
  for (const { span, part } of drawnToolSpans) {
    const parentByCall = part.parentToolUseId ? `tool:${part.parentToolUseId}` : null;
    const parentByOwner = part.ownerAgentId ? spawnSpanIdByAgentId.get(part.ownerAgentId) : undefined;
    const parentId = [parentByCall, parentByOwner].find(
      (candidate): candidate is string => Boolean(candidate && candidate !== span.id && drawnIds.has(candidate)),
    );
    if (parentId) span.parentId = parentId;
  }

  // A finished turn whose end was not saved reaches as far as what it observed.
  if (!live && args.turnCompletedAt === null) {
    for (const span of spans) {
      if (span.endMs !== null && root.endMs !== null && span.endMs > root.endMs) {
        root.endMs = span.endMs;
      }
    }
  }

  return { spans, unreported, slowestId: findSlowestSpan(spans, nowMs), nowMs, usage: sumUsage(args.messages) };
}

/** Move a live axis without re-parsing every tool's input and observed times. */
export function advanceTurnTrace(trace: TurnTrace, now: number): TurnTrace {
  if (trace.nowMs === null) return trace;
  const nowMs = Math.max(now, trace.spans[0]?.startMs ?? now);
  if (nowMs === trace.nowMs) return trace;
  return { ...trace, nowMs, slowestId: findSlowestSpan(trace.spans, nowMs) };
}

function findSlowestSpan(spans: readonly TurnTraceSpan[], nowMs: number | null): string | null {
  const parentIds = new Set(spans.map((span) => span.parentId).filter(Boolean));
  const leaves = spans.filter((span) => span.kind !== "turn" && !parentIds.has(span.id));
  let slowestId: string | null = null;
  if (leaves.length >= 2) {
    let longest = -1;
    for (const span of leaves) {
      const duration = spanDurationMs(span, nowMs ?? span.endMs ?? span.startMs);
      if (duration > longest) {
        longest = duration;
        slowestId = span.id;
      }
    }
  }

  return slowestId;
}

/** A span's length; a running span is measured to `nowMs`. */
export function spanDurationMs(span: Pick<TurnTraceSpan, "startMs" | "endMs">, nowMs: number) {
  return Math.max(0, (span.endMs ?? Math.max(nowMs, span.startMs)) - span.startMs);
}
