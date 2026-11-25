import { i18n } from "@/i18n/runtime";
import {
  buildAssistantTrace,
  joinReasoningText,
} from "@/components/session/message/assistant-trace-builder";
import { readDelegationReceipt } from "@/lib/delegation/message-subagents";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage, ToolUsePart } from "@/types/chat";
import type { AgentStep, AgentStepStatus } from "./agent-progress.types";
import type { AgentStepsResult } from "./from-history";
import {
  firstLine,
  isSubagentToolName,
  subagentStep,
  textStep,
  thinkingStep,
  toolStep,
} from "./step-builders";

/**
 * Conversation messages (a delegated task's or a review's own task, or the
 * parent's tool calls for an in-turn subagent) as progress steps. The steps
 * come from the conversation's own trace builder, so a step reads the same as
 * its row in the conversation; the conversation's rendering is untouched.
 */

export interface MessageStepOptions {
  /** The agent is still working: unfinished calls read as running. */
  live: boolean;
  cwd?: string;
  /** The task whose messages these are; addresses subagents it started. */
  taskId?: string;
  workspaceId?: string;
  providerId?: ProviderId;
}

function parseMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/** A call another agent made inside this one belongs to that agent's progress. */
function isNestedPart(part: ToolUsePart) {
  return Boolean(part.parentToolUseId || part.ownerAgentId);
}

function toolStatus(part: ToolUsePart, live: boolean): AgentStepStatus {
  if (part.state === "output-error" || (part.exitCode != null && part.exitCode !== 0)) return "error";
  if (part.state === "output-available") return "done";
  // A turn that ended seals its unfinished calls; they are no longer running.
  return live ? "running" : "done";
}

function toolTiming(part: ToolUsePart) {
  const startedAt = parseMs(part.startedAt);
  const completedAt = parseMs(part.completedAt);
  const durationMs = startedAt !== undefined && completedAt !== undefined && completedAt >= startedAt
    ? completedAt - startedAt
    : part.elapsedSeconds != null && part.elapsedSeconds >= 0 ? part.elapsedSeconds * 1000 : undefined;
  return {
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

/** One recorded tool call as a step: a subagent it started, a delegated task, or a call. */
export function stepFromToolPart(part: ToolUsePart, id: string, options: MessageStepOptions): AgentStep {
  const base = {
    id,
    toolName: part.toolName,
    input: part.input,
    ...(part.output !== undefined ? { output: part.output } : {}),
    status: toolStatus(part, options.live),
    ...toolTiming(part),
    cwd: options.cwd,
  };
  if (isSubagentToolName(part.toolName)) {
    return subagentStep({
      ...base,
      ...(part.toolUseId ? { toolUseId: part.toolUseId } : {}),
      ...(part.agentId ? { agentId: part.agentId } : {}),
      ...(options.providerId ? { providerId: options.providerId } : {}),
      ...(options.taskId ? { taskId: options.taskId } : {}),
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    });
  }
  if (part.toolName.endsWith("stave_delegate_task")) {
    const receipt = readDelegationReceipt(part.output);
    if (receipt) {
      const step = toolStep(base);
      const title = firstLine(receipt.delegationKey.replace(/-[0-9a-f]{12}$/, "").replace(/[-_.]+/g, " "));
      return {
        ...step,
        kind: "subagent",
        childId: `delegated-task:${receipt.delegatedTaskId}`,
        child: {
          kind: "delegated-task",
          delegatedTaskId: receipt.delegatedTaskId,
          delegatedWorkspaceId: receipt.delegatedWorkspaceId,
          delegationKey: receipt.delegationKey,
          title,
        },
      };
    }
  }
  return toolStep(base);
}

function questionText(part: { questions: { question: string; header: string }[] }) {
  return part.questions.map((question) => question.question || question.header).filter(Boolean).join("\n");
}

function stepsFromAssistantMessage(
  message: ChatMessage,
  options: MessageStepOptions & { isLast: boolean },
): { steps: AgentStep[]; answer?: string } {
  const trace = buildAssistantTrace({ message });
  const live = options.live && Boolean(message.isStreaming);
  const steps: AgentStep[] = [];
  const key = (entryId: string) => `${message.id}:${entryId}`;
  for (const entry of trace.entries) {
    switch (entry.kind) {
      case "reasoning": {
        const text = joinReasoningText(entry.parts);
        // A single recorded pass has its own bounds. Merged reasoning parts
        // do not prove the agent was reasoning continuously between them.
        const pass = entry.parts.length === 1 ? entry.parts[0] : undefined;
        const startedAt = parseMs(pass?.startedAt);
        const end = parseMs(pass?.completedAt);
        const durationMs = startedAt !== undefined && end !== undefined && end > startedAt ? end - startedAt : undefined;
        if (text.trim()) steps.push(thinkingStep({ id: key(entry.id), text, startedAt, durationMs, running: live && entry.isStreaming }));
        break;
      }
      case "assistant_text": {
        const text = entry.parts.map((part) => part.text).join("\n");
        if (text.trim()) steps.push(textStep({ id: key(entry.id), kind: "text", text }));
        break;
      }
      case "tool":
      case "subagent":
      case "todo":
        if (!isNestedPart(entry.part)) steps.push(stepFromToolPart(entry.part, key(entry.id), { ...options, live }));
        break;
      case "approval":
        steps.push(textStep({
          id: key(entry.id),
          kind: "note",
          text: entry.part.description || entry.part.toolName,
          status: entry.part.state === "approval-requested" ? "running" : "done",
        }));
        break;
      case "user_input":
        steps.push(textStep({
          id: key(entry.id),
          kind: "note",
          text: questionText(entry.part) || i18n.t("session:agentProgress.step.question"),
          status: entry.part.state === "input-requested" ? "running" : "done",
        }));
        break;
      case "diff":
        steps.push(toolStep({
          id: key(entry.id),
          toolName: "fileChange",
          input: JSON.stringify({ paths: entry.parts.map((part) => part.filePath) }),
          status: "done",
          cwd: options.cwd,
        }));
        break;
      case "system":
        steps.push(textStep({ id: key(entry.id), kind: "note", text: entry.part.content }));
        break;
    }
  }
  const response = trace.responseParts.map((part) => part.text).join("\n").trim();
  if (!response) return { steps };
  // Only the newest settled answer is the agent's answer; earlier ones are steps.
  if (options.isLast && !live) return { steps, answer: response };
  steps.push(textStep({ id: `${message.id}:response`, kind: "text", text: response }));
  return { steps };
}

/**
 * A task's messages as progress: the first user message is the ask, later
 * ones are follow-ups, and the newest settled answer is the result.
 */
export function stepsFromMessages(messages: readonly ChatMessage[], options: MessageStepOptions): AgentStepsResult {
  let ask: string | undefined;
  let result: string | undefined;
  const steps: AgentStep[] = [];
  const lastAssistant = messages.findLastIndex((message) => message.role === "assistant");
  messages.forEach((message, index) => {
    if (message.role === "user") {
      const text = message.content.trim();
      if (!text) return;
      if (ask === undefined && steps.length === 0) ask = message.content;
      else steps.push(textStep({ id: `${message.id}:user`, kind: "user", text: message.content }));
      return;
    }
    if (message.role !== "assistant") return;
    const read = stepsFromAssistantMessage(message, { ...options, isLast: index === lastAssistant });
    steps.push(...read.steps);
    if (read.answer !== undefined) result = read.answer;
  });
  return { ...(ask !== undefined ? { ask } : {}), steps, ...(result !== undefined ? { result } : {}) };
}

/**
 * An in-turn subagent's calls as the parent recorded them: the parts it owns
 * (`ownerAgentId`) or that ran under its spawning call (`parentToolUseId`).
 * Its own spawn call is the header, not a step.
 */
export function stepsFromSubagentParts(args: {
  messages: readonly Pick<ChatMessage, "id" | "parts">[];
  toolUseId?: string;
  agentId?: string;
} & MessageStepOptions): AgentStep[] {
  if (!args.toolUseId && !args.agentId) return [];
  const steps: AgentStep[] = [];
  for (const message of args.messages) {
    message.parts.forEach((part, index) => {
      if (part.type !== "tool_use" || (args.toolUseId && part.toolUseId === args.toolUseId)) return;
      const owned = (args.agentId && part.ownerAgentId === args.agentId) ||
        (args.toolUseId && part.parentToolUseId === args.toolUseId);
      if (!owned) return;
      steps.push(stepFromToolPart(part, `${message.id}:part-${part.toolUseId ?? index}`, args));
    });
  }
  return steps;
}

/** What a running subagent reported about itself, as notes, oldest first. */
export function stepsFromProgressMessages(progress: readonly string[], idPrefix: string): AgentStep[] {
  const seen = new Set<string>();
  const steps: AgentStep[] = [];
  progress.forEach((text, index) => {
    const value = text.trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    steps.push(textStep({ id: `${idPrefix}:progress-${index}`, kind: "note", text: value }));
  });
  return steps;
}
