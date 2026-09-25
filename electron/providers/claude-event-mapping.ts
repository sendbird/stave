import { execFileSync } from "node:child_process";
import type {
  SDKAssistantMessage,
  SDKHookProgressMessage,
  SDKHookResponseMessage,
  SDKHookStartedMessage,
  SDKInformationalMessage,
  SDKMessage,
  SDKPermissionDeniedMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { BridgeEvent } from "./types";
import { toText } from "./utils";

function buildClaudeTaskProgressEvents(
  message: Extract<SDKMessage, { type: "system" }> & {
    subtype?: string;
    summary?: string;
  },
) {
  if (message.subtype !== "task_progress") {
    return [];
  }
  const summary = message.summary?.trim();
  if (!summary) {
    return [];
  }
  return [
    {
      type: "system" as const,
      content: `Subagent progress: ${summary}`,
    },
  ];
}

export function buildClaudeUsageEvent(resultMsg: SDKResultMessage): BridgeEvent {
  return {
    type: "usage",
    inputTokens: resultMsg.usage.input_tokens,
    outputTokens: resultMsg.usage.output_tokens,
    ...(resultMsg.usage.cache_read_input_tokens != null
      ? { cacheReadTokens: resultMsg.usage.cache_read_input_tokens }
      : {}),
    ...(resultMsg.usage.cache_creation_input_tokens != null
      ? { cacheCreationTokens: resultMsg.usage.cache_creation_input_tokens }
      : {}),
    ...(typeof resultMsg.total_cost_usd === "number"
      ? { totalCostUsd: resultMsg.total_cost_usd }
      : {}),
    ...("ttft_ms" in resultMsg && typeof resultMsg.ttft_ms === "number"
      ? { ttftMs: resultMsg.ttft_ms }
      : {}),
  };
}

function resolveGitHeadRef(args: { cwd?: string }) {
  if (!args.cwd) {
    return undefined;
  }
  try {
    const output = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: args.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const gitRef = output.trim().split("\n")[0]?.trim();
    return gitRef || undefined;
  } catch {
    return undefined;
  }
}

type ClaudePlanStreamBlockState = {
  sourceSegmentId?: string;
  partialJson: string;
  lastPlanText?: string;
};

export type ClaudePlanStreamState = {
  exitPlanBlocksByIndex: Map<number, ClaudePlanStreamBlockState>;
};

export function createClaudePlanStreamState(): ClaudePlanStreamState {
  return {
    exitPlanBlocksByIndex: new Map<number, ClaudePlanStreamBlockState>(),
  };
}

function normalizeClaudeStreamIndex(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function extractClaudeToolUseId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function extractClaudePlanTextFromToolInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const plan = (input as Record<string, unknown>).plan;
  return typeof plan === "string" && plan.trim().length > 0 ? plan : null;
}

function parseClaudeToolInputJson(partialJson: string) {
  const trimmed = partialJson.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildClaudePlanReadyEvent(args: {
  planText: string;
  sourceSegmentId?: string;
}): BridgeEvent {
  return {
    type: "plan_ready",
    planText: args.planText,
    ...(args.sourceSegmentId ? { sourceSegmentId: args.sourceSegmentId } : {}),
  };
}

function buildClaudeFallbackPlanSegmentId(index: number) {
  return `claude-exit-plan-${index}`;
}

function mapClaudeStreamPlanEvent(args: {
  streamEvent: Record<string, unknown>;
  planState: ClaudePlanStreamState;
}): BridgeEvent[] {
  const { streamEvent, planState } = args;

  if (
    streamEvent.type === "message_start" ||
    streamEvent.type === "message_stop"
  ) {
    planState.exitPlanBlocksByIndex.clear();
    return [];
  }

  if (streamEvent.type === "content_block_start") {
    const index = normalizeClaudeStreamIndex(streamEvent.index);
    const contentBlock =
      streamEvent.content_block && typeof streamEvent.content_block === "object"
        ? (streamEvent.content_block as Record<string, unknown>)
        : null;
    if (
      index == null ||
      !contentBlock ||
      contentBlock.type !== "tool_use" ||
      contentBlock.name !== "ExitPlanMode"
    ) {
      return [];
    }

    const sourceSegmentId =
      extractClaudeToolUseId(contentBlock.id) ??
      buildClaudeFallbackPlanSegmentId(index);
    const initialInput =
      contentBlock.input && typeof contentBlock.input === "object"
        ? (contentBlock.input as Record<string, unknown>)
        : null;
    const initialPlanText = extractClaudePlanTextFromToolInput(initialInput);

    planState.exitPlanBlocksByIndex.set(index, {
      sourceSegmentId,
      partialJson: "",
      lastPlanText: initialPlanText ?? undefined,
    });

    return initialPlanText
      ? [
          buildClaudePlanReadyEvent({
            planText: initialPlanText,
            sourceSegmentId,
          }),
        ]
      : [];
  }

  if (streamEvent.type === "content_block_delta") {
    const index = normalizeClaudeStreamIndex(streamEvent.index);
    const delta =
      streamEvent.delta && typeof streamEvent.delta === "object"
        ? (streamEvent.delta as Record<string, unknown>)
        : null;
    if (index == null || !delta || delta.type !== "input_json_delta") {
      return [];
    }

    const blockState = planState.exitPlanBlocksByIndex.get(index);
    if (!blockState) {
      return [];
    }

    const partialJson =
      typeof delta.partial_json === "string" ? delta.partial_json : "";
    if (!partialJson) {
      return [];
    }

    blockState.partialJson += partialJson;
    const parsedInput = parseClaudeToolInputJson(blockState.partialJson);
    const planText = extractClaudePlanTextFromToolInput(parsedInput);
    if (!planText || planText === blockState.lastPlanText) {
      return [];
    }

    blockState.lastPlanText = planText;
    return [
      buildClaudePlanReadyEvent({
        planText,
        sourceSegmentId: blockState.sourceSegmentId,
      }),
    ];
  }

  if (streamEvent.type === "content_block_stop") {
    const index = normalizeClaudeStreamIndex(streamEvent.index);
    if (index == null) {
      return [];
    }

    const blockState = planState.exitPlanBlocksByIndex.get(index);
    if (!blockState) {
      return [];
    }

    planState.exitPlanBlocksByIndex.delete(index);
    const parsedInput = parseClaudeToolInputJson(blockState.partialJson);
    const planText = extractClaudePlanTextFromToolInput(parsedInput);
    if (!planText || planText === blockState.lastPlanText) {
      return [];
    }

    return [
      buildClaudePlanReadyEvent({
        planText,
        sourceSegmentId: blockState.sourceSegmentId,
      }),
    ];
  }

  return [];
}

/**
 * Shape of `rate_limit_event.rate_limit_info`, mirroring `SDKRateLimitInfo`.
 *
 * `status`/`utilization` describe the *currently limiting* window only, and
 * `rateLimitType` is what names it — including `"overage"`, the paid
 * extra-usage credit budget, which resets on its own monthly period rather
 * than with the 5-hour or weekly subscription windows. Reporting every one of
 * these as a plain "rate limit" made an exhausted credit balance look like a
 * subscription window that had failed to reset.
 *
 * `utilization` here is a 0..1 fraction (unlike the OAuth usage endpoint's
 * 0..100 percentages, which must never be rescaled) and can legitimately
 * exceed 1 when usage runs past a window's cap.
 */
interface ClaudeRateLimitInfo {
  status?: string;
  resetsAt?: number;
  rateLimitType?: string;
  utilization?: number;
  overageStatus?: string;
  overageResetsAt?: number;
  overageDisabledReason?: string;
  isUsingOverage?: boolean;
  errorCode?: string;
}

const CLAUDE_RATE_LIMIT_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour limit",
  seven_day: "weekly limit",
  seven_day_opus: "weekly Opus limit",
  seven_day_sonnet: "weekly Sonnet limit",
  seven_day_overage_included: "weekly limit",
};

/**
 * Weekly and credit windows reset days away, so a bare `toLocaleTimeString()`
 * reported "resets at 8:00:00 AM" with no hint of which day.
 */
function formatClaudeRateLimitReset(epochSeconds: number | undefined): string {
  if (!epochSeconds) {
    return "unknown";
  }
  const reset = new Date(epochSeconds * 1000);
  return reset.toDateString() === new Date().toDateString()
    ? reset.toLocaleTimeString()
    : reset.toLocaleString();
}

/**
 * Extra usage is exhausted rather than merely inactive. `overageStatus` is
 * deliberately not consulted: it tracks the overflow request outcome, while
 * these two say the credit balance itself is gone.
 */
function isClaudeOutOfUsageCredits(info: ClaudeRateLimitInfo): boolean {
  return (
    info.overageDisabledReason === "out_of_credits" ||
    info.errorCode === "credits_required"
  );
}

function buildClaudeRateLimitEvents(
  info: ClaudeRateLimitInfo | undefined,
): BridgeEvent[] {
  if (!info) {
    return [];
  }
  const isOverage = info.rateLimitType === "overage";
  const windowLabel = info.rateLimitType
    ? CLAUDE_RATE_LIMIT_WINDOW_LABELS[info.rateLimitType]
    : undefined;

  if (info.status === "rejected") {
    const resetsAt = isOverage
      ? (info.overageResetsAt ?? info.resetsAt)
      : info.resetsAt;
    const resetTime = formatClaudeRateLimitReset(resetsAt);
    const headline = isOverage
      ? "Extra usage credits are exhausted"
      : `Rate limit reached${windowLabel ? ` (${windowLabel})` : ""}`;
    const creditSuffix =
      !isOverage && isClaudeOutOfUsageCredits(info)
        ? " Extra usage credits are also exhausted."
        : "";
    return [
      {
        type: "error",
        message: `${headline}. Resets at ${resetTime}.${creditSuffix}`,
        recoverable: true,
      },
    ];
  }

  if (info.status === "allowed_warning") {
    const pct =
      info.utilization != null
        ? ` (${Math.round(info.utilization * 100)}% used)`
        : "";
    const headline = isOverage
      ? "Approaching your extra usage credit limit"
      : `Approaching ${windowLabel ?? "rate limit"}`;
    let creditSuffix = "";
    if (!isOverage && isClaudeOutOfUsageCredits(info)) {
      creditSuffix = " Extra usage credits are exhausted.";
    } else if (!isOverage && info.isUsingOverage) {
      creditSuffix = " Extra usage credits are covering the overflow.";
    }
    return [
      {
        type: "system",
        content: `${headline}${pct}. Consider pacing requests.${creditSuffix}`,
      },
    ];
  }

  return [];
}

/**
 * Minimal view of `SubagentProgressTracker` needed while mapping tool_use
 * blocks, so the mapper stays a pure function of its inputs. Deliberately named
 * for the *owner* direction: Claude reports which subagent a tool call ran
 * inside, never which subagent a spawn call produced.
 */
export type ClaudeOwnerAgentIdResolver = {
  resolveOwnerAgentId(toolUseId: string | undefined): string | undefined;
};

// Kept for transport adapters that report a failure outside the SDK union.
export type ClaudeIncomingMessage = SDKMessage | { type: "error"; message?: unknown };

export function mapClaudeMessageToEvents(args: {
  message: ClaudeIncomingMessage;
  claudeDebugStream: boolean;
  cwd?: string;
  planState?: ClaudePlanStreamState;
  ownerAgentIdResolver?: ClaudeOwnerAgentIdResolver;
}): BridgeEvent[] {
  const { message, claudeDebugStream } = args;

  if (message.type === "system") {
    const sysMsg = message as Extract<SDKMessage, { type: "system" }> & {
      subtype?: string;
      content?: string;
      summary?: string;
    };
    if (sysMsg.subtype === "plugin_install") {
      if (sysMsg.status === "installed" && sysMsg.name) {
        return [{ type: "system", content: `Plugin installed: ${sysMsg.name}` }];
      }
      if (sysMsg.status === "failed" && sysMsg.name) {
        return [{ type: "system", content: `Plugin install failed: ${sysMsg.name}${sysMsg.error ? ` — ${sysMsg.error}` : ""}` }];
      }
      return [];
    }
    if (sysMsg.subtype === "permission_denied") {
      const denied = message as SDKPermissionDeniedMessage;
      return [
        {
          type: "permission_denial",
          toolName: denied.tool_name,
          message: denied.message,
          ...(denied.decision_reason_type
            ? { reasonType: denied.decision_reason_type }
            : {}),
          ...(denied.decision_reason ? { reason: denied.decision_reason } : {}),
        },
      ];
    }
    if (sysMsg.subtype === "hook_started") {
      const hook = message as SDKHookStartedMessage;
      return [
        {
          type: "hook_activity",
          hookId: hook.hook_id,
          hookName: hook.hook_name,
          hookEvent: hook.hook_event,
          status: "running",
        },
      ];
    }
    if (sysMsg.subtype === "hook_progress") {
      const hook = message as SDKHookProgressMessage;
      return [
        {
          type: "hook_activity",
          hookId: hook.hook_id,
          hookName: hook.hook_name,
          hookEvent: hook.hook_event,
          status: "running",
        },
      ];
    }
    if (sysMsg.subtype === "hook_response") {
      const hook = message as SDKHookResponseMessage;
      return [
        {
          type: "hook_activity",
          hookId: hook.hook_id,
          hookName: hook.hook_name,
          hookEvent: hook.hook_event,
          status:
            hook.outcome === "success"
              ? "completed"
              : hook.outcome === "cancelled"
                ? "cancelled"
                : "failed",
        },
      ];
    }
    if (sysMsg.subtype === "informational") {
      const informational = message as SDKInformationalMessage;
      if (informational.prevent_continuation && informational.content.trim()) {
        return [
          {
            type: "hook_activity",
            hookId: `hook-feedback:${informational.uuid}`,
            hookName: "Hook feedback",
            hookEvent: "unknown",
            status: "blocked",
          },
          { type: "system", content: informational.content },
        ];
      }
    }
    if (
      sysMsg.subtype === "local_command_output" &&
      typeof sysMsg.content === "string" &&
      sysMsg.content.trim()
    ) {
      return [{ type: "text", text: sysMsg.content }];
    }
    if (
      sysMsg.subtype === "init" &&
      typeof sysMsg.session_id === "string" &&
      sysMsg.session_id.trim()
    ) {
      return [
        {
          type: "provider_session",
          providerId: "claude-code",
          nativeSessionId: sysMsg.session_id,
        },
      ];
    }
    if (sysMsg.subtype === "compact_boundary") {
      const meta = (sysMsg as { compact_metadata?: { trigger?: string } })
        .compact_metadata;
      const trigger = meta?.trigger ?? "auto";
      const gitRef = resolveGitHeadRef({ cwd: args.cwd });
      return [
        {
          type: "system",
          content: `Context compacted (${trigger}).`,
          compactBoundary: {
            trigger,
            ...(gitRef ? { gitRef } : {}),
          },
        },
      ];
    }
    if (sysMsg.subtype === "status") {
      const status = (sysMsg as { status?: string | null }).status;
      if (status === "compacting") {
        return [
          { type: "system", content: "Compacting conversation context\u2026" },
        ];
      }
      if (status === "requesting") {
        return [{ type: "system", content: "Sending request to model\u2026" }];
      }
      return [];
    }
    const taskProgressEvents = buildClaudeTaskProgressEvents(sysMsg);
    if (taskProgressEvents.length > 0) {
      return taskProgressEvents;
    }
    if (claudeDebugStream) {
      console.debug(
        "[claude-sdk-runtime] system init",
        sysMsg.subtype,
        sysMsg.session_id,
      );
    }
    return [];
  }

  if (message.type === "assistant") {
    const assistantMsg = message as SDKAssistantMessage;
    const historyEvents: BridgeEvent[] =
      assistantMsg.parent_tool_use_id === null && assistantMsg.uuid
        ? [
            {
              type: "history_boundary",
              providerId: "claude-code",
              boundaryKind: "message",
              nativeId: assistantMsg.uuid,
              targetRole: "assistant",
            },
          ]
        : [];

    if (assistantMsg.error) {
      if (assistantMsg.error === "authentication_failed") {
        return [
          ...historyEvents,
          {
            type: "error",
            message:
              "Claude authentication failed. Run `claude auth login` and retry.",
            recoverable: true,
          },
        ];
      }
      if (assistantMsg.error === "billing_error") {
        return [
          ...historyEvents,
          {
            type: "error",
            message:
              "Claude billing/subscription issue detected. Check plan/payment status and retry.",
            recoverable: true,
          },
        ];
      }
    }

    const nativeSessionId =
      typeof assistantMsg.session_id === "string"
        ? assistantMsg.session_id.trim()
        : "";
    const nativeTurnId =
      typeof assistantMsg.uuid === "string" ? assistantMsg.uuid.trim() : "";
    const events: BridgeEvent[] =
      nativeSessionId && nativeTurnId
        ? [
            {
              type: "provider_turn",
              providerId: "claude-code",
              nativeSessionId,
              nativeTurnId,
            },
          ]
        : [];

    // Nesting is reported once per message, not per content block: every
    // tool_use in this message ran inside the same parent tool call.
    const parentToolUseId = extractClaudeToolUseId(
      assistantMsg.parent_tool_use_id,
    );

    // content is on the nested BetaMessage, not at the top level
    const contentBlocks = assistantMsg.message?.content;
    if (!Array.isArray(contentBlocks)) {
      return [...historyEvents, ...events];
    }

    for (const block of contentBlocks) {
      const b = block as {
        type?: string;
        text?: string;
        thinking?: string;
        name?: string;
        input?: unknown;
        id?: string;
      };
      if (b.type === "text" && b.text) {
        // Claude text currently has no Stave segmentId equivalent. That is
        // acceptable today because streamed text is usually followed by a
        // duplicate assembled assistant message that we suppress later, rather
        // than multiple distinct top-level assistant text items like Codex.
        // If markdown sections ever start collapsing together for Claude,
        // compare this path with the Codex segmentId handling before touching
        // renderer code.
        events.push({ type: "text", text: b.text });
        continue;
      }
      if (b.type === "thinking" && b.thinking) {
        events.push({ type: "thinking", text: b.thinking });
        continue;
      }
      if (b.type === "redacted_thinking") {
        // skip — redacted thinking is not surfaced to the user
        continue;
      }
      if (b.type === "tool_use") {
        const toolUseId = extractClaudeToolUseId(b.id);
        if (b.name === "ExitPlanMode") {
          const planText = extractClaudePlanTextFromToolInput(b.input) ?? "";
          events.push(
            buildClaudePlanReadyEvent({
              planText,
              sourceSegmentId: toolUseId,
            }),
          );
          continue;
        }
        // No `agentId` here: when an Agent/Task spawn call is emitted the
        // child's task_id does not exist yet, and guessing one would invert a
        // graph edge. The reducer binds the spawn call to its worker later,
        // from a task_progress carrying both toolUseId and task_id.
        const ownerAgentId =
          args.ownerAgentIdResolver?.resolveOwnerAgentId(toolUseId);
        events.push({
          type: "tool",
          ...(toolUseId ? { toolUseId } : {}),
          toolName: b.name ?? "tool_use",
          input: toText(b.input ?? {}),
          state: "input-available",
          ...(ownerAgentId ? { ownerAgentId } : {}),
          ...(parentToolUseId ? { parentToolUseId } : {}),
        });
        continue;
      }
    }
    return [...historyEvents, ...events];
  }

  if (message.type === "stream_event") {
    // SDKPartialAssistantMessage — streaming content deltas
    const streamMsg = message as { type: "stream_event"; event: unknown };
    const event = streamMsg.event;
    if (!event || typeof event !== "object") {
      return [];
    }
    const streamEvent = event as {
      type?: string;
      delta?: { type?: string; thinking?: string; text?: string };
      error?: { message?: string };
    };
    const streamPlanEvents = args.planState
      ? mapClaudeStreamPlanEvent({
          streamEvent: event as Record<string, unknown>,
          planState: args.planState,
        })
      : [];
    if (streamPlanEvents.length > 0) {
      return streamPlanEvents;
    }
    if (streamEvent.type === "content_block_delta") {
      if (
        streamEvent.delta?.type === "thinking_delta" &&
        streamEvent.delta.thinking
      ) {
        return [
          {
            type: "thinking",
            text: streamEvent.delta.thinking,
            isStreaming: true,
          },
        ];
      }
      if (streamEvent.delta?.type === "text_delta" && streamEvent.delta.text) {
        // Keep this in sync with the assistant text-block note above.
        return [{ type: "text", text: streamEvent.delta.text }];
      }
      return [];
    }
    if (streamEvent.type === "error") {
      return [
        {
          type: "error",
          message: `Claude stream error: ${toText(streamEvent.error ?? streamEvent)}`,
          recoverable: false,
        },
      ];
    }
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] stream_event", streamEvent);
    }
    return [];
  }

  if (
    message.type === "user" ||
    (message as { type: string }).type === "user_message_replay"
  ) {
    // Surface tool_result content blocks so the UI can populate subagent output.
    const userMsg = message as {
      type: string;
      message?: { content?: unknown };
      parent_tool_use_id?: string | null;
      isSynthetic?: boolean;
      origin?: { kind?: string };
      uuid?: string;
    };
    const userContent = userMsg.message?.content;
    const containsToolResult =
      Array.isArray(userContent) &&
      userContent.some(
        (block) =>
          Boolean(block) &&
          typeof block === "object" &&
          (block as { type?: string }).type === "tool_result",
      );
    const historyEvents: BridgeEvent[] =
      message.type === "user" &&
      typeof userMsg.uuid === "string" &&
      userMsg.uuid.length > 0 &&
      userMsg.parent_tool_use_id == null &&
      userMsg.isSynthetic !== true &&
      (!userMsg.origin || userMsg.origin.kind === "human") &&
      !containsToolResult
        ? [
            {
              type: "history_boundary",
              providerId: "claude-code",
              boundaryKind: "message",
              nativeId: userMsg.uuid,
              targetRole: "user",
            },
          ]
        : [];
    if (Array.isArray(userContent)) {
      const toolResultEvents: BridgeEvent[] = [];
      for (const block of userContent) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const b = block as {
          type?: string;
          tool_use_id?: string;
          content?: unknown;
        };
        if (b.type !== "tool_result" || typeof b.tool_use_id !== "string") {
          continue;
        }
        let output = "";
        if (typeof b.content === "string") {
          output = b.content;
        } else if (Array.isArray(b.content)) {
          output = b.content
            .flatMap((c: unknown) => {
              if (!c || typeof c !== "object") {
                return [];
              }
              const cb = c as { type?: string; text?: string };
              return cb.type === "text" && typeof cb.text === "string"
                ? [cb.text]
                : [];
            })
            .join("\n");
        }
        toolResultEvents.push({
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          output,
        });
      }
      return [...historyEvents, ...toolResultEvents];
    }
    return historyEvents;
  }

  if (message.type === "prompt_suggestion") {
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] prompt_suggestion", message);
    }
    const suggestion = (message as { suggestion?: string }).suggestion?.trim();
    if (!suggestion) {
      return [];
    }
    return [{ type: "prompt_suggestions", suggestions: [suggestion] }];
  }

  if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    const events: BridgeEvent[] = [buildClaudeUsageEvent(resultMsg)];
    if (resultMsg.is_error) {
      const errorText = (resultMsg as { result?: string }).result;
      events.unshift({
        type: "error",
        message:
          typeof errorText === "string" && errorText.trim().length > 0
            ? errorText
            : "Claude turn failed.",
        recoverable: true,
      });
    }
    return events;
  }

  if (message.type === "rate_limit_event") {
    const rlMsg = message as {
      type: "rate_limit_event";
      rate_limit_info?: ClaudeRateLimitInfo;
    };
    // The runtime records every observation, including plain `allowed`
    // events. Only warnings and rejections produce chat events here.
    return buildClaudeRateLimitEvents(rlMsg.rate_limit_info);
  }

  if (message.type === "tool_progress") {
    const progressMsg = message as {
      type: "tool_progress";
      tool_use_id?: string;
      tool_name?: string;
      elapsed_time_seconds?: number;
    };
    const toolUseId = progressMsg.tool_use_id;
    if (typeof toolUseId === "string" && toolUseId) {
      return [
        {
          type: "tool_progress",
          toolUseId,
          toolName: progressMsg.tool_name ?? "tool",
          elapsedSeconds: progressMsg.elapsed_time_seconds ?? 0,
        },
      ];
    }
    return [];
  }

  if (message.type === "tool_use_summary") {
    const sumMsg = message as { type: "tool_use_summary"; summary?: string };
    const summary = sumMsg.summary?.trim();
    if (summary) {
      return [{ type: "system", content: summary }];
    }
    return [];
  }

  if (message.type === "auth_status") {
    if (claudeDebugStream) console.debug("[claude-sdk-runtime] meta", message.type, message);
    return [];
  }

  if (message.type === "error") {
    return [
      {
        type: "error",
        message: `Claude error: ${toText(message)}`,
        recoverable: false,
      },
    ];
  }

  return [];
}
