import { i18n } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import {
  formatToolDisplayName,
  isSubagentToolName,
  resolveSubagentBadge,
  resolveToolTitle,
  truncateWorkText,
} from "@/lib/providers/subagent-identity";
import {
  describeToolOperationLabel,
  isTodoToolName,
  resolveToolProviderDetail,
} from "@/lib/providers/tool-activity";
import type { TurnDigestEntry } from "@/lib/providers/turn-digest";
import type { TurnHistoryEntry, TurnRecordMessage } from "@/lib/providers/turn-history";
import {
  resolveGeneralToolDetail,
  resolveToolDetail,
  resolveToolResultDetail,
  type RetainedTurnOutcome,
} from "@/lib/providers/turn-status";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import type { ApprovalPart, ChatMessage, ToolUsePart, UserInputPart } from "@/types/chat";
import type { Tone } from "@/components/ads/utils/tone";
import {
  describeRetainedTurnHeadline,
  formatTurnActivityElapsedSeconds,
  type TurnActivityItem,
  type TurnActivityRowStatus,
} from "./turn-activity.utils";

/** A record lists at most this many steps; the rest stay in the conversation. */
export const TURN_RECORD_STEP_LIMIT = 300;

/** The outcome glyph and headline a recorded turn rests on. */
export function resolveTurnRecordOutcome(
  turn: Pick<TurnHistoryEntry, "outcome">,
): RetainedTurnOutcome {
  if (turn.outcome === "completed") return "completed";
  if (turn.outcome === "failed") return "failed";
  if (turn.outcome === "cancelled") return "stopped";
  return "unknown";
}

/** The first characters of a turn id: enough to tell turns apart and to find the same turn again. */
export function shortTurnId(turnId: string) {
  return turnId.replace(/-/g, "").slice(0, 8);
}

function toolStepStatus(state: ToolUsePart["state"]): TurnActivityRowStatus {
  if (state === "output-error") return "failed";
  if (state === "output-available") return "completed";
  // A call the turn never finished: it ended before a result came back.
  return "pending";
}

function describeToolStep(part: ToolUsePart, index: number): TurnActivityItem {
  const isSubagent = isSubagentToolName(part.toolName);
  const title = resolveToolTitle(part.toolName, part.input, undefined, { isSubagent });
  const failed = part.state === "output-error";
  const inputDetail = isSubagent ? resolveToolDetail(part.input) : resolveGeneralToolDetail(part.input);
  // Same reading as the live list: an agent's result summarizes its run and a
  // failure explains itself; a plain tool's output is usually noise.
  const resultDetail = (isSubagent || failed) && part.output ? resolveToolResultDetail(part.output) : undefined;
  const detail = resultDetail ?? inputDetail ?? (part.output ? truncateWorkText(part.output) : undefined);
  const providerDetail = truncateWorkText(resolveToolProviderDetail({ toolName: part.toolName, title }) ?? "");
  const badge = isSubagent ? resolveSubagentBadge(part.input) : undefined;
  return {
    id: `tool:${part.toolUseId ?? index}`,
    status: toolStepStatus(part.state),
    title,
    ...(detail ? { detail } : {}),
    ...(providerDetail ? { providerDetail } : {}),
    ...(badge ? { badge } : {}),
    ...(part.elapsedSeconds != null ? { elapsedSeconds: part.elapsedSeconds } : {}),
    ...(part.toolUseId ? { toolUseId: part.toolUseId } : {}),
    iconKey: isSubagent ? "subagent" : "tool",
  };
}

function toolLabel(toolName: string) {
  return describeToolOperationLabel(toolName) ?? formatToolDisplayName(toolName) ?? toolName;
}

function describeApprovalStep(part: ApprovalPart): TurnActivityItem {
  const status: TurnActivityRowStatus =
    part.state === "approval-responded" ? "completed" : part.state === "output-denied" ? "failed" : "pending";
  const title =
    part.state === "approval-responded"
      ? i18n.t("fleet:taskExecutionSummary.approvalAnswered")
      : part.state === "output-denied"
        ? i18n.t("fleet:taskExecutionSummary.approvalDenied")
        : i18n.t("fleet:taskExecutionSummary.approvalInterrupted");
  const detail = truncateWorkText(part.description);
  return {
    id: `approval:${part.requestId}`,
    status,
    title,
    ...(detail ? { detail } : {}),
    providerDetail: truncateWorkText(toolLabel(part.toolName)) ?? part.toolName,
    iconKey: "pause",
  };
}

function describeQuestionStep(part: UserInputPart): TurnActivityItem {
  const status: TurnActivityRowStatus =
    part.state === "input-responded" ? "completed" : part.state === "input-denied" ? "failed" : "pending";
  const title =
    part.state === "input-responded"
      ? i18n.t("fleet:taskExecutionSummary.questionAnswered")
      : part.state === "input-denied"
        ? i18n.t("fleet:taskExecutionSummary.questionDeclined")
        : i18n.t("fleet:taskExecutionSummary.questionInterrupted");
  const question = truncateWorkText(part.questions[0]?.question ?? "");
  return {
    id: `question:${part.requestId}`,
    status,
    title,
    ...(question ? { detail: question } : {}),
    iconKey: "pause",
  };
}

/**
 * A finished turn's steps, rebuilt from its saved messages: every top-level
 * tool call and agent, each approval and question, then the turn's last todo
 * list. A subagent's own tool calls stay folded into its row, as in the
 * conversation. The live list keeps only a recent tail; a record keeps the
 * whole turn up to `TURN_RECORD_STEP_LIMIT`.
 */
export function buildTurnRecordSteps(args: {
  messages: readonly TurnRecordMessage[];
  turn: Pick<TurnHistoryEntry, "outcome" | "error">;
}): { items: TurnActivityItem[]; omitted: number } {
  const items: TurnActivityItem[] = [];
  if (args.turn.outcome === "failed") {
    items.push({
      id: "turn-error",
      status: "failed",
      title: i18n.t("session:turnActivityUtils.title4"),
      ...(args.turn.error ? { detail: args.turn.error } : {}),
      iconKey: "alert",
    });
  }
  let latestTodo: ToolUsePart | null = null;
  let index = 0;
  for (const message of args.messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      index += 1;
      if (part.type === "tool_use") {
        if (part.ownerAgentId || part.parentToolUseId) continue;
        if (isTodoToolName(part.toolName)) {
          latestTodo = part;
          continue;
        }
        items.push(describeToolStep(part, index));
      } else if (part.type === "approval") {
        // A request nobody was asked about is kept for the approval record
        // only; the conversation never showed it.
        if (part.prompted !== false) items.push(describeApprovalStep(part));
      } else if (part.type === "user_input") {
        items.push(describeQuestionStep(part));
      }
    }
  }
  if (latestTodo) {
    deriveTodoTraceItems({ input: latestTodo.input, state: latestTodo.state }).forEach((todo, todoIndex) => {
      items.push({
        id: `todo:${todo.content}:${todoIndex}`,
        // An ended turn's unfinished todos did not finish; none is still running.
        status: todo.status === "completed" ? "completed" : "pending",
        title: todo.content,
        iconKey: "todo",
      });
    });
  }
  return {
    items: items.slice(0, TURN_RECORD_STEP_LIMIT),
    omitted: Math.max(0, items.length - TURN_RECORD_STEP_LIMIT),
  };
}

export type TurnRecordEntryTone = Extract<Tone, "danger" | "warning" | "success" | "neutral">;
export type TurnRecordEntryIcon = "error" | "retry" | "stall" | "route" | "account" | "checks";

export interface TurnRecordEntryView {
  id: string;
  tone: TurnRecordEntryTone;
  icon: TurnRecordEntryIcon;
  title: string;
  detail?: string;
  /** Raw values from the provider or a script, shown apart from Stave's words. */
  providerDetail?: string;
  /** Seconds from the turn's start to the entry. */
  offsetSeconds?: number;
  /** A check run's failures, one line each. */
  failures?: Array<{ id: string; scriptId: string; message: string; blocking: boolean }>;
  moreFailures?: number;
}

function offsetSeconds(turnStartedAt: string, at: string) {
  const offset = (Date.parse(at) - Date.parse(turnStartedAt)) / 1000;
  return Number.isFinite(offset) && offset >= 0 ? offset : undefined;
}

/** One digest entry in Stave's words. */
export function describeTurnDigestEntry(
  entry: TurnDigestEntry,
  args: {
    index: number;
    turnStartedAt: string;
    accountLabel: (providerId: string, accountProfileId: string) => string;
  },
): TurnRecordEntryView {
  const base = {
    id: `${entry.kind}:${args.index}`,
    ...(offsetSeconds(args.turnStartedAt, entry.at) != null
      ? { offsetSeconds: offsetSeconds(args.turnStartedAt, entry.at) }
      : {}),
  };
  switch (entry.kind) {
    case "error":
      return {
        ...base,
        tone: "danger",
        icon: "error",
        title: entry.count > 1
          ? i18n.t("session:turnRecord.entry.errorRepeated", { times: entry.count })
          : i18n.t("session:turnRecord.entry.error"),
        detail: entry.message,
      };
    case "retry":
      return {
        ...base,
        tone: "warning",
        icon: "retry",
        title: entry.count > 1
          ? i18n.t("session:turnRecord.entry.retryRepeated", { times: entry.count })
          : i18n.t("session:turnRecord.entry.retry"),
        detail: entry.message,
      };
    case "stall": {
      const duration = formatTurnActivityElapsedSeconds(entry.silentMs / 1000);
      return {
        ...base,
        tone: "warning",
        icon: "stall",
        title: i18n.t("session:turnActivityUtils.detail5", { value1: duration }),
        detail: entry.endedTurn
          ? i18n.t("session:turnRecord.entry.stallEnded")
          : i18n.t("session:turnRecord.entry.stallContinued"),
      };
    }
    case "route":
      return {
        ...base,
        tone: "neutral",
        icon: "route",
        title: entry.fromModel
          ? i18n.t("session:turnRecord.entry.modelChanged", { from: entry.fromModel, to: entry.toModel })
          : i18n.t("session:turnRecord.entry.modelRoute", { model: entry.toModel }),
        ...(entry.reason ? { detail: entry.reason } : {}),
        ...(entry.cause ? { providerDetail: entry.cause } : {}),
      };
    case "account": {
      const values = {
        from: args.accountLabel(entry.providerId, entry.fromAccountId),
        to: args.accountLabel(entry.providerId, entry.toAccountId),
      };
      return {
        ...base,
        tone: "neutral",
        icon: "account",
        title: entry.since === "previous-turn"
          ? i18n.t("session:turnRecord.entry.accountSincePrevious", values)
          : i18n.t("session:turnRecord.entry.accountDuringTurn", values),
      };
    }
    case "checks":
      return {
        ...base,
        tone: entry.status === "pass" ? "success" : entry.status === "warn" ? "warning" : "danger",
        icon: "checks",
        // A blocking failure stops the checks after it, so a failed run is
        // counted by its failures, not by how many ran.
        title: entry.status === "pass"
          ? i18n.t("session:turnRecord.entry.checksPassed", { passed: entry.executed, count: entry.total })
          : entry.status === "warn"
            ? i18n.t("session:turnRecord.entry.checksWarned", { failed: entry.failures.length + entry.omittedFailures, count: entry.total })
            : i18n.t("session:turnRecord.entry.checksFailed", { failed: entry.failures.length + entry.omittedFailures, count: entry.total }),
        failures: entry.failures.map((failure, failureIndex) => ({
          id: `${failure.scriptId}:${failureIndex}`,
          ...failure,
        })),
        ...(entry.omittedFailures > 0 ? { moreFailures: entry.omittedFailures } : {}),
      };
  }
}

/**
 * The request behind each turn whose reply is loaded: the user message right
 * before the turn's first reply. Turns further back than the loaded messages
 * have none and are named by time alone.
 */
export function collectTurnPrompts(messages: readonly ChatMessage[]): Record<string, string> {
  const prompts: Record<string, string> = {};
  let request: string | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      if (!message.steeredIntoTurnId) {
        request = truncateWorkText((message.displayContent ?? message.content).split("\n").find((line) => line.trim()) ?? "") ?? null;
      }
      continue;
    }
    if (message.turnId && request && !(message.turnId in prompts)) {
      prompts[message.turnId] = request;
    }
  }
  return prompts;
}

export interface TurnPickerOption {
  value: string;
  label: string;
  detail?: string;
  keywords: string[];
}

function describePickerState(turn: TurnHistoryEntry, liveTurnId: string | null) {
  if (turn.id === liveTurnId) return i18n.t("common:status.running");
  if (!turn.completedAt) return i18n.t("session:turnHistory.didNotFinish");
  return describeRetainedTurnHeadline(resolveTurnRecordOutcome(turn));
}

/**
 * Picker options, newest first. A turn is named by when it started and how it
 * ended; its request, provider and short id follow, and all of them are
 * searchable along with the full id and the failure it ended on.
 */
export function buildTurnPickerOptions(args: {
  turns: readonly TurnHistoryEntry[];
  liveTurnId: string | null;
  prompts: Readonly<Record<string, string>>;
}): TurnPickerOption[] {
  const options = args.turns.map((turn) => {
    const time = formatDateTime(turn.createdAt, { dateStyle: "medium", timeStyle: "short" });
    const state = describePickerState(turn, args.liveTurnId);
    const provider = getProviderLabel({ providerId: turn.providerId });
    const prompt = args.prompts[turn.id];
    const shortId = shortTurnId(turn.id);
    return {
      value: turn.id,
      label: `${time} · ${state}`,
      detail: [prompt, provider, shortId].filter(Boolean).join(" · "),
      keywords: [time, state, provider, turn.id, shortId, prompt ?? "", turn.error ?? ""].filter(Boolean),
    };
  });
  if (args.liveTurnId && !args.turns.some((turn) => turn.id === args.liveTurnId)) {
    const shortId = shortTurnId(args.liveTurnId);
    const state = i18n.t("common:status.running");
    options.unshift({
      value: args.liveTurnId,
      label: state,
      detail: shortId,
      keywords: [state, args.liveTurnId, shortId],
    });
  }
  return options;
}

export type TurnHistoryView = { kind: "activity" } | { kind: "record"; turnId: string };

/**
 * What Activity shows for the picker's choice. The live turn, or the last one
 * while Stave still holds it, keeps the full activity view; any other turn
 * opens its record. With no choice made and nothing in memory (after a
 * restart), the newest saved turn opens, so the panel is not empty.
 */
export function resolveTurnHistoryView(args: {
  selected: string | null;
  liveTurnId: string | null;
  retainedTurnId: string | null;
  latestTurnId: string | null;
}): { view: TurnHistoryView; shownTurnId: string | null } {
  const activityTurnId = args.liveTurnId ?? args.retainedTurnId;
  const shownTurnId = args.selected ?? activityTurnId ?? args.latestTurnId;
  if (!shownTurnId || shownTurnId === activityTurnId) {
    return { view: { kind: "activity" }, shownTurnId };
  }
  return { view: { kind: "record", turnId: shownTurnId }, shownTurnId };
}
