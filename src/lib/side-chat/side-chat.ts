import { planBoundedHistory } from "@/lib/providers/bounded-history";
import {
  canonicalHistoryText,
  toCanonicalConversationMessage,
} from "@/lib/providers/canonical-request";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnPendingInteraction } from "@/lib/providers/turn-status";
import type { ChatMessage } from "@/types/chat";

/**
 * Side questions: a one-off, read-only question about a task, asked while its
 * agent works. The task's provider answers from a bounded excerpt of the
 * conversation and what the live turn is doing. The answer is shown beside
 * the conversation and kept only while the app runs: nothing is added to the
 * task's conversation, its next turn or its saved state.
 */

/** The Stave slash command that asks a side question. */
export const SIDE_CHAT_COMMAND = "/aside";

/** Providers whose read-only prompt path answers side questions. */
export const SIDE_CHAT_PROVIDER_IDS = ["claude-code", "codex"] as const;
export type SideChatProviderId = (typeof SIDE_CHAT_PROVIDER_IDS)[number];

export function isSideChatProvider(
  providerId: ProviderId | null | undefined,
): providerId is SideChatProviderId {
  return providerId === "claude-code" || providerId === "codex";
}

/** A question longer than this is cut; the panel's field stops there too. */
export const SIDE_CHAT_QUESTION_MAX_CHARS = 4_000;
const ACTIVITY_STEP_LIMIT = 12;
const ACTIVITY_STEP_CHARS = 240;
const ACTIVITY_REPLY_CHARS = 1_200;

/**
 * `/aside <question>` as typed in the composer: the question, possibly empty.
 * Null for anything else, including a longer command such as `/asides`.
 */
export function parseSideChatCommand(text: string): { question: string } | null {
  const trimmed = text.trimStart();
  if (!trimmed.toLowerCase().startsWith(SIDE_CHAT_COMMAND)) return null;
  const rest = trimmed.slice(SIDE_CHAT_COMMAND.length);
  if (rest.length > 0 && !/^\s/.test(rest)) return null;
  return { question: rest.trim() };
}

function clip(value: string, limit: number) {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

function clipTail(value: string, limit: number) {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `…${trimmed.slice(-(limit - 1))}`;
}

/** A tool call's input in a few words: its command, file or query when it names one. */
function describeToolInput(input: string) {
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    for (const key of ["command", "file_path", "path", "pattern", "query", "description", "url"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    // Not JSON: use the raw text.
  }
  return input;
}

const TOOL_STATE_WORDS: Record<string, string> = {
  "input-streaming": "running",
  "input-available": "running",
  "output-available": "done",
  "output-error": "failed",
};

/**
 * What the task's live turn is doing, for the model: whether it runs or waits,
 * its latest top-level steps, and the newest reply text. Model-facing and in
 * English, like the rest of the prompt.
 */
export function describeSideChatActivity(args: {
  messages: readonly ChatMessage[];
  running: boolean;
  pendingInteraction?: ProviderTurnPendingInteraction | null;
  stalled?: boolean;
}): string {
  if (!args.running) {
    // i18n-ignore: model-facing context, sent to the provider as-is
    return "No turn is running. The conversation above ends with the task's latest reply.";
  }
  const lines: string[] = [];
  if (args.pendingInteraction === "approval") {
    // i18n-ignore: model-facing context, sent to the provider as-is
    lines.push("A turn is running and waits for the user to approve a request.");
  } else if (args.pendingInteraction === "user_input") {
    // i18n-ignore: model-facing context, sent to the provider as-is
    lines.push("A turn is running and waits for the user to answer a question.");
  } else if (args.stalled) {
    // i18n-ignore: model-facing context, sent to the provider as-is
    lines.push("A turn is running but has sent no update for a while.");
  } else {
    // i18n-ignore: model-facing context, sent to the provider as-is
    lines.push("A turn is running.");
  }
  const reply = [...args.messages].reverse().find((message) => message.role === "assistant");
  if (!reply?.isStreaming) {
    return lines.join("\n");
  }
  const steps = reply.parts.flatMap((part) => {
    if (part.type === "tool_use" && !part.ownerAgentId && !part.parentToolUseId) {
      const state = TOOL_STATE_WORDS[part.state] ?? part.state;
      return [`- ${part.toolName}: ${clip(describeToolInput(part.input), ACTIVITY_STEP_CHARS)} (${state})`];
    }
    if (part.type === "approval" && part.state === "approval-requested") {
      return [`- approval requested for ${part.toolName}: ${clip(part.description, ACTIVITY_STEP_CHARS)}`];
    }
    if (part.type === "user_input" && part.state === "input-requested") {
      return [`- question to the user: ${clip(part.questions[0]?.question ?? "", ACTIVITY_STEP_CHARS)}`];
    }
    return [];
  });
  if (steps.length > 0) {
    // i18n-ignore: model-facing context, sent to the provider as-is
    lines.push("Its latest steps, oldest first:", ...steps.slice(-ACTIVITY_STEP_LIMIT));
  }
  const text = reply.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();
  if (text) {
    // i18n-ignore: model-facing context, sent to the provider as-is
    lines.push("Its reply so far:", clipTail(text, ACTIVITY_REPLY_CHARS));
  }
  return lines.join("\n");
}

/**
 * The read-only prompt for a side question: the instructions, a bounded
 * excerpt of the conversation (built like a provider switch's excerpt), the
 * live activity and the question. The reply being written belongs to the
 * activity, not the excerpt.
 */
export function buildSideChatPrompt(args: {
  messages: readonly ChatMessage[];
  activity: string;
  question: string;
}): string {
  const settled = args.messages.filter((message) => !message.isStreaming);
  const history = planBoundedHistory({
    messages: settled.map((message) => {
      const canonical = toCanonicalConversationMessage({ message });
      return { role: canonical.role, text: canonicalHistoryText(canonical) };
    }),
  });
  return [
    "[Side Question Instructions]",
    // i18n-ignore: model-facing instruction, sent to the provider as-is
    "The person working on this task asks a side question while the task's agent works. Answer it from the task conversation and the current activity below. You are not the task's agent: you cannot change anything, your answer is not added to the task's conversation, and the agent does not see this exchange. Answer briefly and plainly. If the context does not say, say so.",
    "",
    "[Task Conversation]",
    history.text,
    "",
    "[Current Activity]",
    args.activity,
    "",
    "[Side Question]",
    args.question.trim().slice(0, SIDE_CHAT_QUESTION_MAX_CHARS),
  ].join("\n");
}

/** The answer as quoted Markdown, for the composer: the user decides whether to send it. */
export function quoteSideChatAnswer(answer: string) {
  return answer
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

/** The draft with the quoted answer added below what it already says. */
export function appendQuotedAnswer(draft: string, answer: string) {
  const quoted = quoteSideChatAnswer(answer);
  const before = draft.trimEnd();
  return before ? `${before}\n\n${quoted}\n\n` : `${quoted}\n\n`;
}
