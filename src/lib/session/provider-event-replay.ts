import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import { sanitizeMessagePartPayload } from "@/lib/file-context-sanitization";
import { hasMeaningfulPlanText, normalizePlanText } from "@/lib/plan-text";
import {
  advanceProviderSessionCursor,
  getProviderSessionId,
  rememberProviderSession,
} from "@/lib/providers/provider-sessions";
import { appendProviderOutputTruncationNotice } from "@/lib/truncation-visibility";
import type {
  NormalizedProviderEvent,
  ProviderGoalSnapshot,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  hasRenderableAssistantContent,
  findLatestPendingToolInteractionPart,
  interruptPendingToolInteractionParts,
  mergePromptSuggestions,
  mergeToolResultIntoPart,
  resolvePendingToolInteractionPartsByRequestId,
} from "@/store/provider-message.utils";
import type {
  ApprovalPart,
  ChatMessage,
  CodeDiffPart,
  MessagePart,
  TextPart,
  ThinkingPart,
  ToolUsePart,
  TurnModelInfo,
  UserInputPart,
} from "@/types/chat";

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function buildRecentTimestamp() {
  return new Date().toISOString();
}

function providerGoalsEqual(
  left: ProviderGoalSnapshot | null,
  right: ProviderGoalSnapshot | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.providerId === right.providerId &&
    left.nativeSessionId === right.nativeSessionId &&
    left.objective === right.objective &&
    left.status === right.status &&
    left.tokenBudget === right.tokenBudget &&
    left.tokensUsed === right.tokensUsed &&
    left.timeUsedSeconds === right.timeUsedSeconds &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function createTextPart(args: { text: string; segmentId?: string }): TextPart {
  return sanitizeMessagePartPayload({
    type: "text",
    text: args.text,
    ...(args.segmentId ? { segmentId: args.segmentId } : {}),
  });
}

function createThinkingPart(args: {
  text: string;
  isStreaming: boolean;
}): ThinkingPart {
  const timestamp = buildRecentTimestamp();
  return sanitizeMessagePartPayload({
    type: "thinking",
    text: args.text,
    isStreaming: args.isStreaming,
    ...(args.isStreaming
      ? { startedAt: timestamp }
      : { startedAt: timestamp, completedAt: timestamp }),
  });
}

function createToolPart(args: {
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state: ToolUsePart["state"];
  workerExecution?: ToolUsePart["workerExecution"];
}): ToolUsePart {
  return sanitizeMessagePartPayload({
    type: "tool_use",
    toolUseId: args.toolUseId,
    toolName: args.toolName,
    input: args.input,
    output: args.output,
    state: args.state,
    workerExecution: args.workerExecution,
  });
}

function createDiffPart(args: {
  filePath: string;
  oldContent: string;
  newContent: string;
  status: CodeDiffPart["status"];
}): CodeDiffPart {
  return sanitizeMessagePartPayload({
    type: "code_diff",
    filePath: args.filePath,
    oldContent: args.oldContent,
    newContent: args.newContent,
    status: args.status,
  });
}

function createApprovalPart(args: {
  requestId: string;
  toolName: string;
  description: string;
  input?: string;
}): ApprovalPart {
  return sanitizeMessagePartPayload({
    type: "approval",
    toolName: args.toolName,
    requestId: args.requestId,
    description: args.description,
    ...(args.input ? { input: args.input } : {}),
    state: "approval-requested",
  });
}

function createUserInputPart(args: {
  requestId: string;
  toolName: string;
  questions: UserInputPart["questions"];
}): UserInputPart {
  return sanitizeMessagePartPayload({
    type: "user_input",
    requestId: args.requestId,
    toolName: args.toolName,
    questions: args.questions,
    state: "input-requested",
  });
}

function isAgentToolPart(part: MessagePart): part is ToolUsePart {
  return (
    part.type === "tool_use" && part.toolName.trim().toLowerCase() === "agent"
  );
}

function finalizeTrailingThinkingPart(args: {
  parts: MessagePart[];
  completedAt?: string;
}): MessagePart[] {
  const lastPart = args.parts.at(-1);
  if (lastPart?.type !== "thinking" || !lastPart.isStreaming) {
    return args.parts;
  }

  const completedAt = args.completedAt ?? buildRecentTimestamp();
  return [
    ...args.parts.slice(0, -1),
    {
      ...lastPart,
      isStreaming: false,
      completedAt: lastPart.completedAt ?? completedAt,
    },
  ];
}

function shouldFinalizeThinkingBeforeEvent(event: NormalizedProviderEvent) {
  switch (event.type) {
    case "thinking":
    case "usage":
    case "prompt_suggestions":
    case "provider_session":
    case "provider_turn":
    case "browser_connection":
    case "goal_status":
    case "history_boundary":
    case "hook_activity":
    case "advisor_activity":
    case "model_resolved":
    case "done":
      return false;
    default:
      return true;
  }
}

/**
 * Append a progress message to the matching Agent tool_use part.
 *
 * Resolution:
 *  1. If `toolUseId` is provided, find the exact ToolUsePart.
 *  2. Otherwise, find the last Agent tool_use that has not completed yet.
 *  3. If no active Agent exists, fall back to the last Agent in the array.
 */
function appendSubagentProgressToPart(args: {
  parts: MessagePart[];
  toolUseId: string | undefined;
  content: string;
}): MessagePart[] {
  const { parts, toolUseId, content } = args;

  let targetIndex = -1;

  // 1. Try exact match by toolUseId
  if (toolUseId) {
    targetIndex = parts.findIndex(
      (p) => p.type === "tool_use" && p.toolUseId === toolUseId,
    );
  }

  // 2. Fallback: last active (non-completed) Agent tool_use
  if (targetIndex === -1) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i]!;
      if (
        isAgentToolPart(p) &&
        (p.state === "input-streaming" || p.state === "input-available")
      ) {
        targetIndex = i;
        break;
      }
    }
  }

  // 3. Fallback: last Agent tool_use regardless of state
  if (targetIndex === -1) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (isAgentToolPart(parts[i]!)) {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === -1) {
    // No Agent tool_use found — degrade to a standalone system_event part.
    return [
      ...parts,
      {
        type: "system_event" as const,
        content: `Subagent progress: ${content}`,
      },
    ];
  }

  const target = parts[targetIndex] as ToolUsePart;
  const updatedPart: ToolUsePart = {
    ...target,
    progressMessages: [...(target.progressMessages ?? []), content],
  };
  const result = [...parts];
  result[targetIndex] = updatedPart;
  return result;
}

function resolvePendingToolInteractionMessage(args: {
  message: ChatMessage;
  event: NormalizedProviderEvent;
}) {
  const requestId =
    args.event.type === "tool"
      ? args.event.toolUseId
      : args.event.type === "tool_progress"
        ? args.event.toolUseId
        : args.event.type === "tool_result"
          ? args.event.tool_use_id
          : undefined;

  const resolvedParts = resolvePendingToolInteractionPartsByRequestId({
    parts: args.message.parts,
    requestId,
  });

  return resolvedParts === args.message.parts
    ? args.message
    : {
        ...args.message,
        parts: resolvedParts,
      };
}

function normalizeEventToPart(args: {
  event: NormalizedProviderEvent;
}): MessagePart | null {
  const { event } = args;

  switch (event.type) {
    case "thinking":
      return createThinkingPart({
        text: event.text,
        isStreaming: event.isStreaming ?? false,
      });
    case "text":
      return createTextPart({ text: event.text, segmentId: event.segmentId });
    case "provider_session":
    case "provider_turn":
    case "browser_connection":
    case "goal_status":
    case "history_boundary":
    case "hook_activity":
    // Advisor lifecycle lives in its own store slice, never in the transcript:
    // the advice text must not become a persisted assistant response.
    case "advisor_activity":
      return null;
    case "permission_denial": {
      const reason = event.reason?.trim() || event.message.trim();
      return sanitizeMessagePartPayload({
        type: "system_event",
        content: reason
          ? `Permission denied for ${event.toolName}: ${reason}`
          : `Permission denied for ${event.toolName}.`,
      });
    }
    case "tool":
      return createToolPart({
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: event.input,
        output: event.output,
        state: event.state,
        workerExecution: event.workerExecution,
      });
    case "diff":
      return createDiffPart({
        filePath: event.filePath,
        oldContent: event.oldContent,
        newContent: event.newContent,
        status: event.status ?? "pending",
      });
    case "approval":
      return createApprovalPart({
        requestId: event.requestId,
        toolName: event.toolName,
        description: event.description,
        input: event.input,
      });
    case "user_input":
      return createUserInputPart({
        requestId: event.requestId,
        toolName: event.toolName,
        questions: event.questions,
      });
    case "system":
      return sanitizeMessagePartPayload({
        type: "system_event",
        content: event.content,
        ...(event.compactBoundary
          ? {
              compactBoundary: {
                ...(event.compactBoundary.trigger
                  ? { trigger: event.compactBoundary.trigger }
                  : {}),
                ...(event.compactBoundary.gitRef
                  ? { gitRef: event.compactBoundary.gitRef }
                  : {}),
              },
            }
          : {}),
      });
    case "subagent_progress":
      // Handled separately in appendProviderEventToAssistant — not a standalone part.
      return null;
    case "error":
      return sanitizeMessagePartPayload({
        type: "system_event",
        content: `[error] ${event.message}`,
      });
    case "tool_progress":
    case "tool_result":
    case "usage":
    case "prompt_suggestions":
    case "plan_ready":
    case "model_resolved":
    case "done":
      return null;
  }
}

/**
 * True when an event belongs to a message of its own because the current target
 * is already a plan response.
 *
 * `plan_ready` is excluded on purpose: re-presenting an updated plan replaces
 * the existing plan message rather than starting a new one. `provider_turn`
 * only qualifies when it announces a *different* native turn — the plan's own
 * turn still belongs to the plan row.
 */
function startsMessageAfterPlan(args: {
  target: ChatMessage;
  event: NormalizedProviderEvent;
}): boolean {
  const { target, event } = args;
  if (event.type === "plan_ready") {
    return false;
  }
  if (event.type === "provider_turn") {
    return (
      target.nativeProviderTurnId != null &&
      target.nativeProviderTurnId !== event.nativeTurnId
    );
  }
  return normalizeEventToPart({ event }) !== null;
}

function providerBoundariesEqual(
  left: ChatMessage["providerBoundary"],
  right: ChatMessage["providerBoundary"],
): boolean {
  return (
    left?.providerId === right?.providerId &&
    left?.kind === right?.kind &&
    left?.nativeId === right?.nativeId
  );
}

/**
 * Copy the native turn identity of `from` onto `message`.
 *
 * Splitting one provider turn across several rows must not strand a row without
 * that identity: `buildConversationTurnActionStateByMessageId` disables
 * fork/rollback on any assistant row missing `nativeProviderTurnId` ("this
 * response predates native turn tracking").
 */
function inheritNativeTurnIdentity(args: {
  message: ChatMessage;
  from: ChatMessage;
}): ChatMessage {
  const { from } = args;
  return {
    ...args.message,
    ...(from.nativeProviderSessionId
      ? { nativeProviderSessionId: from.nativeProviderSessionId }
      : {}),
    ...(from.nativeProviderTurnId
      ? { nativeProviderTurnId: from.nativeProviderTurnId }
      : {}),
    ...(from.providerBoundary
      ? { providerBoundary: from.providerBoundary }
      : {}),
  };
}

/**
 * Seal the trailing plan row and open the assistant message that carries the
 * rest of the turn. The new row inherits the plan's native turn identity; a
 * later `provider_turn`/`history_boundary` for a genuinely new turn overwrites
 * it in place.
 */
function openMessageAfterPlan(args: {
  messages: ChatMessage[];
  plan: ChatMessage;
  taskId: string;
  messageIndexOffset: number;
  provider: ProviderId;
  model: string;
}): { messages: ChatMessage[]; target: ChatMessage } {
  const target = inheritNativeTurnIdentity({
    message: createStreamingAssistantMessage({
      taskId: args.taskId,
      count: args.messages.length + args.messageIndexOffset,
      provider: args.provider,
      model: args.model,
      ...(args.plan.modelInfo ? { modelInfo: args.plan.modelInfo } : {}),
    }),
    from: args.plan,
  });
  return {
    messages: [
      ...args.messages.slice(0, -1),
      releaseTurnUsage(finalizeAssistantMessage({ message: args.plan })),
      target,
    ],
    target,
  };
}

function createStreamingAssistantMessage(args: {
  taskId: string;
  count: number;
  provider: ProviderId;
  model: string;
  modelInfo?: TurnModelInfo;
}): ChatMessage {
  const startedAt = buildRecentTimestamp();
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: args.model,
    providerId: args.provider,
    ...(args.modelInfo ? { modelInfo: args.modelInfo } : {}),
    content: "",
    startedAt,
    isStreaming: true,
    parts: [],
  };
}

/**
 * Strip `<proposed_plan>…</proposed_plan>` (and any incomplete open-tag
 * suffix) from a string so raw XML plan tags never leak into the chat UI.
 * Text before and after the block is preserved.
 */
function stripProposedPlanBlock(text: string): string {
  const openTag = "<proposed_plan>";
  const closeTag = "</proposed_plan>";
  const openIdx = text.indexOf(openTag);
  if (openIdx === -1) return text;
  const closeIdx = text.indexOf(closeTag, openIdx);
  if (closeIdx === -1) {
    // Partial tag (streaming cut-off) — strip from open tag onwards.
    return text.slice(0, openIdx).trimEnd();
  }
  const before = text.slice(0, openIdx).trimEnd();
  const after = text.slice(closeIdx + closeTag.length).trimStart();
  return before + (after ? `\n\n${after}` : "");
}

/**
 * Remove `<proposed_plan>` blocks from a ChatMessage's `content` and its
 * text parts so the streamed assistant message no longer shows garbled XML
 * once the plan is promoted to a dedicated plan message.
 */
function stripPlanTagsFromMessage(message: ChatMessage): ChatMessage {
  const content = stripProposedPlanBlock(message.content);
  const parts = message.parts
    .map((part) => {
      if (part.type !== "text") return part;
      const cleaned = stripProposedPlanBlock(part.text);
      return cleaned ? { ...part, text: cleaned } : null;
    })
    .filter((p): p is MessagePart => p != null);
  return { ...message, content, parts };
}

/**
 * Remove text parts from a specific provider segment. Codex structured plan
 * items stream through the normal text path before they are promoted into a
 * dedicated plan response, so replay needs the source segment id to strip that
 * transient preview without dropping unrelated commentary from other segments.
 */
function stripTextSegmentFromMessage(args: {
  message: ChatMessage;
  segmentId?: string;
}): ChatMessage {
  const segmentId = args.segmentId?.trim();
  if (!segmentId) {
    return args.message;
  }

  let removed = false;
  const parts = args.message.parts.filter((part) => {
    if (part.type === "text" && part.segmentId === segmentId) {
      removed = true;
      return false;
    }
    return true;
  });

  if (!removed) {
    return args.message;
  }

  const content = parts.reduce(
    (acc, part) => (part.type === "text" ? `${acc}${part.text}` : acc),
    "",
  );
  return {
    ...args.message,
    content,
    parts,
  };
}

function createPlanAssistantMessage(args: {
  taskId: string;
  count: number;
  provider: ProviderId;
  model: string;
  modelInfo?: TurnModelInfo;
  planText: string;
  isStreaming?: boolean;
}): ChatMessage {
  const startedAt = buildRecentTimestamp();
  const normalizedPlanText = normalizePlanText(args.planText);
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: args.model,
    providerId: args.provider,
    ...(args.modelInfo ? { modelInfo: args.modelInfo } : {}),
    content: normalizedPlanText,
    startedAt,
    isStreaming: args.isStreaming ?? true,
    isPlanResponse: true,
    planText: normalizedPlanText,
    parts: [],
  };
}

/**
 * Hand a turn's usage on when the turn outlives the message carrying it.
 *
 * Usage is a fact about the *turn*, but it rides whichever assistant message
 * was open when a `usage` event landed, and consumers sum it across messages
 * (`buildUsageMetric` in src/lib/fleet/task-execution-summary.ts). One turn may
 * open several messages — a plan seals the message before it and opens one
 * after — so a running total dropped mid-turn would sit on a sealed message and
 * be counted a second time when `turn/completed` reports the authoritative
 * figure on the message that is still open. Dropping it here keeps exactly one
 * carrier per turn, which is the invariant the sum relies on.
 */
function releaseTurnUsage(message: ChatMessage): ChatMessage {
  if (!message.usage) {
    return message;
  }
  const { usage: _usage, ...rest } = message;
  return rest;
}

function finalizeAssistantMessage(args: {
  message: ChatMessage;
  completedAt?: string;
}): ChatMessage {
  const completedAt = args.completedAt ?? buildRecentTimestamp();
  const finalizedParts = args.message.parts.map((part) => {
    if (part.type === "thinking" && part.isStreaming) {
      return {
        ...part,
        isStreaming: false,
        completedAt: part.completedAt ?? completedAt,
      };
    }
    if (part.type === "tool_use") {
      if (
        part.state === "input-available" ||
        part.state === "input-streaming"
      ) {
        return { ...part, state: "output-available" as const };
      }
      return part;
    }
    return part;
  });

  return {
    ...args.message,
    completedAt,
    isStreaming: false,
    parts: finalizedParts,
  };
}

export function appendProviderEventToAssistant(args: {
  message: ChatMessage;
  event: NormalizedProviderEvent;
}): ChatMessage {
  if (args.event.type === "usage") {
    return {
      ...args.message,
      usage: {
        ...args.message.usage,
        inputTokens: args.event.inputTokens,
        outputTokens: args.event.outputTokens,
        ...(args.event.cacheReadTokens != null
          ? { cacheReadTokens: args.event.cacheReadTokens }
          : {}),
        ...(args.event.cacheCreationTokens != null
          ? { cacheCreationTokens: args.event.cacheCreationTokens }
          : {}),
        ...(args.event.totalCostUsd != null
          ? { totalCostUsd: args.event.totalCostUsd }
          : {}),
        ...(args.event.ttftMs != null ? { ttftMs: args.event.ttftMs } : {}),
      },
    };
  }

  if (args.event.type === "prompt_suggestions") {
    return {
      ...args.message,
      promptSuggestions: mergePromptSuggestions({
        existing: args.message.promptSuggestions,
        incoming: args.event.suggestions,
      }),
    };
  }

  let message = args.message;
  if (shouldFinalizeThinkingBeforeEvent(args.event)) {
    const finalizedParts = finalizeTrailingThinkingPart({
      parts: message.parts,
    });
    if (finalizedParts !== message.parts) {
      message = { ...message, parts: finalizedParts };
    }
  }

  message = resolvePendingToolInteractionMessage({
    message,
    event: args.event,
  });

  if (args.event.type === "subagent_progress") {
    const { toolUseId, content } = args.event;
    const updatedParts = appendSubagentProgressToPart({
      parts: message.parts,
      toolUseId,
      content,
    });
    return { ...message, parts: updatedParts, isStreaming: true };
  }

  // Legacy: system events carrying "Subagent progress:" prefix from older stored
  // events are back-compat migrated into the matching Agent tool part.
  if (
    args.event.type === "system" &&
    args.event.content.trimStart().startsWith("Subagent progress:")
  ) {
    const stripped = args.event.content
      .trimStart()
      .slice("Subagent progress:".length)
      .trim();
    if (stripped) {
      const updatedParts = appendSubagentProgressToPart({
        parts: message.parts,
        toolUseId: undefined,
        content: stripped,
      });
      return { ...message, parts: updatedParts, isStreaming: true };
    }
  }

  if (args.event.type === "tool_progress") {
    const { toolUseId, elapsedSeconds } = args.event;
    const updatedParts = message.parts.map((part) => {
      if (part.type === "tool_use" && part.toolUseId === toolUseId) {
        return { ...part, elapsedSeconds };
      }
      return part;
    });
    return { ...message, parts: updatedParts };
  }

  if (args.event.type === "tool_result") {
    const toolResultEvent = args.event;
    let updatedParts = message.parts.map((part) =>
      mergeToolResultIntoPart({
        part,
        event: toolResultEvent,
      }),
    );

    // Fallback: if no part was updated by exact toolUseId match (e.g. the
    // tool_use part was created from a partial message without an id), find
    // the first tool_use part still waiting for output and adopt the result.
    const merged = updatedParts.some(
      (p) =>
        p.type === "tool_use" && p.toolUseId === toolResultEvent.tool_use_id,
    );
    if (!merged) {
      let adopted = false;
      updatedParts = updatedParts.map((part) => {
        if (
          adopted ||
          part.type !== "tool_use" ||
          part.toolUseId != null ||
          (part.state !== "input-available" && part.state !== "input-streaming")
        ) {
          return part;
        }
        adopted = true;
        return mergeToolResultIntoPart({
          part: { ...part, toolUseId: toolResultEvent.tool_use_id },
          event: toolResultEvent,
        });
      });
    }

    return { ...message, parts: updatedParts };
  }

  if (args.event.type === "plan_ready") {
    const normalizedPlanText = normalizePlanText(args.event.planText);
    if (!hasMeaningfulPlanText(normalizedPlanText)) {
      return message;
    }

    return {
      ...message,
      content: normalizedPlanText,
      isPlanResponse: true,
      planText: normalizedPlanText,
    };
  }

  if (args.event.type === "model_resolved") {
    return {
      ...message,
      providerId: args.event.resolvedProviderId,
      model: args.event.resolvedModel,
    };
  }

  if (args.event.type === "provider_session") {
    return message;
  }

  if (args.event.type === "provider_turn") {
    return {
      ...message,
      nativeProviderSessionId: args.event.nativeSessionId,
      nativeProviderTurnId: args.event.nativeTurnId,
    };
  }

  if (args.event.type === "browser_connection") {
    return message;
  }

  if (args.event.type === "done") {
    const completedAt = buildRecentTimestamp();
    const partsWithTruncationNotice = appendProviderOutputTruncationNotice({
      parts: message.parts,
      stopReason: args.event.stop_reason,
    });
    const messageWithTruncationNotice =
      partsWithTruncationNotice === message.parts
        ? message
        : { ...message, parts: partsWithTruncationNotice };

    if (
      !hasRenderableAssistantContent({ message: messageWithTruncationNotice })
    ) {
      return {
        ...messageWithTruncationNotice,
        content: "No response returned.",
        completedAt,
        isStreaming: false,
        parts: interruptPendingToolInteractionParts({
          parts: [
            ...messageWithTruncationNotice.parts,
            { type: "system_event", content: "No response returned." },
          ],
        }),
      };
    }

    const finalizedMessage = finalizeAssistantMessage({
      message: messageWithTruncationNotice,
      completedAt,
    });

    // Any pending approval/user_input parts at turn completion are orphaned —
    // either the turn ended naturally (the SDK would not emit done while still
    // waiting for a canUseTool decision, so this only happens when the stream
    // ended without a decision — e.g. after a Task-A timeout auto-deny) or the
    // turn was aborted/errored and the runtime synthesized a done. In both
    // cases leaving the parts in `*-requested` state keeps `isTurnActive`
    // true via `findLatestPendingToolInteractionPart`, which locks the
    // PlanViewer's Approve/Revise controls and any dependent UI.
    return {
      ...finalizedMessage,
      parts: interruptPendingToolInteractionParts({
        parts: finalizedMessage.parts,
      }),
    };
  }

  const part = normalizeEventToPart({ event: args.event });
  if (!part) {
    return message;
  }

  const nextParts = [...message.parts];
  const lastPart = nextParts.at(-1);

  // Text-part merging is intentionally conservative. Codex can emit multiple
  // top-level agent_message items in one turn, and replay used to collapse
  // commentary plus the final response into one markdown block after an
  // in-place TodoWrite update. Only merge when the provider preserved the same
  // logical text segment boundary.
  const canMergeTextParts =
    part.type === "text" &&
    lastPart?.type === "text" &&
    ((part.segmentId == null && lastPart.segmentId == null) ||
      part.segmentId === lastPart.segmentId);

  if (canMergeTextParts) {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${part.text}`,
    };
  } else if (part.type === "thinking" && lastPart?.type === "thinking") {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${part.text}`,
      isStreaming: part.isStreaming,
      ...(part.isStreaming
        ? {}
        : { completedAt: lastPart.completedAt ?? buildRecentTimestamp() }),
    };
  } else if (
    part.type === "tool_use" &&
    part.toolName.trim().toLowerCase() === "todowrite"
  ) {
    // Replace the last TodoWrite part in-place so the list updates in-place.
    let existingIdx = -1;
    for (let index = nextParts.length - 1; index >= 0; index -= 1) {
      const candidate = nextParts[index];
      if (
        candidate?.type === "tool_use" &&
        candidate.toolName.trim().toLowerCase() === "todowrite"
      ) {
        existingIdx = index;
        break;
      }
    }
    if (existingIdx !== -1) {
      nextParts[existingIdx] = part;
    } else {
      nextParts.push(part);
    }
  } else if (part.type === "tool_use" && part.toolUseId) {
    // Deduplicate tool_use parts by toolUseId. With includePartialMessages
    // the same tool_use block may arrive in multiple partial assistant
    // messages. Replace the existing part in-place so the UI doesn't create
    // phantom duplicate tool entries that can never receive their result.
    let existingIdx = -1;
    for (let index = nextParts.length - 1; index >= 0; index -= 1) {
      const candidate = nextParts[index];
      if (
        candidate?.type === "tool_use" &&
        candidate.toolUseId === part.toolUseId
      ) {
        existingIdx = index;
        break;
      }
    }
    if (existingIdx !== -1) {
      nextParts[existingIdx] = part;
    } else {
      nextParts.push(part);
    }
  } else if (part.type === "code_diff") {
    // Replace an earlier code_diff for the same file path so the count
    // reflects unique files rather than accumulating duplicates when a
    // file is modified multiple times in a single turn.
    let existingIdx = -1;
    for (let index = nextParts.length - 1; index >= 0; index -= 1) {
      const candidate = nextParts[index];
      if (
        candidate?.type === "code_diff" &&
        candidate.filePath === part.filePath
      ) {
        existingIdx = index;
        break;
      }
    }
    if (existingIdx !== -1) {
      nextParts[existingIdx] = part;
    } else {
      nextParts.push(part);
    }
  } else {
    // When the compact-boundary checkpoint arrives, remove the in-progress
    // "Compacting conversation context…" spinner — it is superseded by the
    // completed checkpoint and should no longer render a loading indicator.
    if (part.type === "system_event" && part.compactBoundary != null) {
      let compactingIdx = -1;
      for (let index = nextParts.length - 1; index >= 0; index -= 1) {
        const candidate = nextParts[index];
        if (
          candidate?.type === "system_event" &&
          candidate.content
            .trim()
            .toLowerCase()
            .startsWith("compacting conversation context")
        ) {
          compactingIdx = index;
          break;
        }
      }
      if (compactingIdx !== -1) {
        nextParts.splice(compactingIdx, 1);
      }
    }
    nextParts.push(part);
  }

  const textAdd = args.event.type === "text" ? args.event.text : "";

  return {
    ...message,
    content: `${message.content}${textAdd}`,
    parts: nextParts,
    isStreaming: true,
  };
}

export function replayProviderEventsToTaskState(args: {
  taskId: string;
  messages: ChatMessage[];
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId?: string;
  nativeSessionReady?: boolean;
  providerSession?: TaskProviderSessionState;
  providerGoal?: ProviderGoalSnapshot | null;
  messageCount?: number;
}) {
  let current = args.messages;
  // `current` may be a trimmed tail window. Positional IDs must continue from the
  // durable total, so convert in-window indices to full-history indices via this
  // offset; newly created messages then never collide with unloaded older rows.
  const messageIndexOffset = Math.max(
    0,
    (args.messageCount ?? 0) - args.messages.length,
  );
  let nextActiveTurnId = args.turnId;
  let nextNativeSessionReady = args.nativeSessionReady ?? false;
  let nextProviderSession = args.providerSession;
  let nextProviderGoal = args.providerGoal ?? null;
  let changed = false;

  for (const event of args.events) {
    if (event.type === "provider_session") {
      const currentSessionId = getProviderSessionId({
        sessions: nextProviderSession,
        providerId: event.providerId,
      });
      if (currentSessionId !== event.nativeSessionId) {
        nextProviderSession = {
          ...nextProviderSession,
          [event.providerId]: rememberProviderSession({
            current: nextProviderSession?.[event.providerId],
            nativeSessionId: event.nativeSessionId,
          }),
        };
        changed = true;
      }
      if (!nextNativeSessionReady) {
        nextNativeSessionReady = true;
        changed = true;
      }
      continue;
    }

    if (event.type === "goal_status") {
      if (!providerGoalsEqual(nextProviderGoal, event.goal)) {
        nextProviderGoal = event.goal;
        changed = true;
      }
      continue;
    }

    if (event.type === "hook_activity" || event.type === "advisor_activity") {
      continue;
    }

    if (event.type === "history_boundary") {
      let targetIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index]?.role === event.targetRole) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex === -1 && event.targetRole === "assistant") {
        const assistant = createStreamingAssistantMessage({
          taskId: args.taskId,
          count: current.length + messageIndexOffset,
          provider: args.provider,
          model: args.model,
        });
        current = [...current, assistant];
        targetIndex = current.length - 1;
      }
      let boundaryTarget = current[targetIndex];
      if (boundaryTarget) {
        const nextBoundary = {
          providerId: event.providerId,
          kind: event.boundaryKind,
          nativeId: event.nativeId,
        } as const;
        // A boundary for a different native turn cannot belong to a sealed plan
        // row — it belongs to the response that follows the plan. Claude emits
        // this ahead of `provider_turn`, so the split has to start here too.
        if (
          boundaryTarget.isPlanResponse === true &&
          targetIndex === current.length - 1 &&
          boundaryTarget.providerBoundary != null &&
          !providerBoundariesEqual(
            boundaryTarget.providerBoundary,
            nextBoundary,
          )
        ) {
          const opened = openMessageAfterPlan({
            messages: current,
            plan: boundaryTarget,
            taskId: args.taskId,
            messageIndexOffset,
            provider: args.provider,
            model: args.model,
          });
          current = opened.messages;
          targetIndex = current.length - 1;
          boundaryTarget = opened.target;
          changed = true;
        }
        if (
          !providerBoundariesEqual(
            boundaryTarget.providerBoundary,
            nextBoundary,
          )
        ) {
          current = current.map((message, index) =>
            index === targetIndex
              ? { ...message, providerBoundary: nextBoundary }
              : message,
          );
          changed = true;
        }
      }
      continue;
    }

    let target = current[current.length - 1];
    if (!target || target.role !== "assistant") {
      target = createStreamingAssistantMessage({
        taskId: args.taskId,
        count: current.length + messageIndexOffset,
        provider: args.provider,
        model: args.model,
      });
      current = [...current, target];
      changed = true;
    }

    if (event.type === "plan_ready") {
      if (!hasMeaningfulPlanText(event.planText)) {
        continue;
      }

      // Strip raw <proposed_plan> tags that leaked into the streaming
      // message so the prior assistant bubble isn't garbled.
      const cleanedTarget = stripPlanTagsFromMessage(
        stripTextSegmentFromMessage({
          message: target,
          segmentId: event.sourceSegmentId,
        }),
      );
      const shouldAppendSeparatePlanMessage =
        !cleanedTarget.isPlanResponse &&
        hasRenderableAssistantContent({ message: cleanedTarget });

      if (shouldAppendSeparatePlanMessage) {
        const finalizedTarget = releaseTurnUsage(
          finalizeAssistantMessage({ message: cleanedTarget }),
        );
        const planMessage = inheritNativeTurnIdentity({
          message: createPlanAssistantMessage({
            taskId: args.taskId,
            count: current.length + messageIndexOffset,
            provider: args.provider,
            model: args.model,
            modelInfo: target.modelInfo,
            planText: event.planText,
          }),
          from: finalizedTarget,
        });

        current = [...current.slice(0, -1), finalizedTarget, planMessage];
        changed = true;
        continue;
      }

      // Prior message was empty after cleaning (or was already a plan
      // response) — let appendProviderEventToAssistant replace it below.
      target = cleanedTarget;
      current = [...current.slice(0, -1), cleanedTarget];
    }

    // A plan response renders as a dedicated plan card whose body is the plan
    // text alone, so anything the agent produces afterwards has no place in it.
    // Appending it here used to hide the rest of the turn — the "shall I
    // proceed?" question, follow-up tool calls, even pending approvals — behind
    // the card. Start a fresh assistant message instead.
    if (
      target.isPlanResponse === true &&
      startsMessageAfterPlan({ target, event })
    ) {
      const opened = openMessageAfterPlan({
        messages: current,
        plan: target,
        taskId: args.taskId,
        messageIndexOffset,
        provider: args.provider,
        model: args.model,
      });
      current = opened.messages;
      target = opened.target;
      changed = true;
    }

    const updated = appendProviderEventToAssistant({
      message: target,
      event,
    });

    current = [...current.slice(0, -1), updated];
    changed = true;

    if (
      event.type !== "system" &&
      event.type !== "error" &&
      event.type !== "done" &&
      !nextNativeSessionReady
    ) {
      nextNativeSessionReady = true;
    }

    if (event.type === "done") {
      const pendingToolInteraction = findLatestPendingToolInteractionPart({
        message: updated,
      });
      if (!pendingToolInteraction) {
        const advancedSession = advanceProviderSessionCursor({
          current: nextProviderSession?.[args.provider],
          syncedThroughMessageId: updated.id,
        });
        if (
          advancedSession &&
          advancedSession !== nextProviderSession?.[args.provider]
        ) {
          nextProviderSession = {
            ...nextProviderSession,
            [args.provider]: advancedSession,
          };
        }
        nextActiveTurnId = undefined;
      }
    }
  }

  return {
    changed,
    messages: current,
    activeTurnId: nextActiveTurnId,
    nativeSessionReady: nextNativeSessionReady,
    providerSession: nextProviderSession,
    providerGoal: nextProviderGoal,
  };
}
