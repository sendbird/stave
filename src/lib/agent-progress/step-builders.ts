import { i18n } from "@/i18n/runtime";
import type { ProviderId } from "@/lib/providers/provider.types";
import { parseSubagentToolInput } from "@/lib/subagent-tool-input";
import type { AgentChildRef, AgentStep, AgentStepStatus } from "./agent-progress.types";
import { describeToolSentence } from "./tool-sentence";

/**
 * The step shapes every adapter builds, so a tool call, a thought or a
 * message reads the same whichever source it came from.
 */

const LINE_MAX = 160;

/** The first non-empty line, clipped: what a folded row shows of a text. */
export function firstLine(text: string, max = LINE_MAX): string {
  const line = text.split("\n").map((value) => value.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function textStep(args: {
  id: string;
  kind: "text" | "user" | "message" | "note";
  text: string;
  status?: AgentStepStatus;
  startedAt?: number;
}): AgentStep {
  const line = firstLine(args.text);
  return {
    id: args.id,
    kind: args.kind,
    doing: line,
    done: line,
    status: args.status ?? "done",
    text: args.text,
    ...(args.startedAt !== undefined ? { startedAt: args.startedAt } : {}),
  };
}

export function thinkingStep(args: { id: string; text: string; running: boolean; startedAt?: number; durationMs?: number }): AgentStep {
  return {
    id: args.id,
    kind: "thinking",
    doing: i18n.t("session:agentProgress.step.thinking"),
    done: i18n.t("session:agentProgress.step.thought"),
    status: args.running ? "running" : "done",
    text: args.text,
    ...(args.startedAt !== undefined ? { startedAt: args.startedAt } : {}),
    ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
  };
}

/** Subagent spawn calls, as Claude (`Agent`, `Task`) and Codex (`spawn_agent`) name them. */
export function isSubagentToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized === "agent" || normalized === "task" || normalized.endsWith("spawnagent");
}

export interface ToolStepInput {
  id: string;
  toolName: string;
  input: string;
  output?: string;
  status: AgentStepStatus;
  startedAt?: number;
  durationMs?: number;
  truncated?: boolean;
  cwd?: string;
}

export function toolStep(args: ToolStepInput): AgentStep {
  const sentence = describeToolSentence(args.toolName, args.input, { cwd: args.cwd });
  return {
    id: args.id,
    kind: "tool",
    doing: sentence.doing,
    done: sentence.done,
    status: args.status,
    toolName: args.toolName,
    ...(args.startedAt !== undefined ? { startedAt: args.startedAt } : {}),
    ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
    detail: {
      source: "inline",
      input: args.input,
      ...(args.output !== undefined ? { output: args.output } : {}),
      ...(args.truncated ? { truncated: true } : {}),
    },
  };
}

/**
 * A subagent another agent started: its row names the agent and opens it.
 * `child` addresses it for the panel; without a way to read it the row stays
 * a plain row with the call's input and answer.
 */
export function subagentStep(args: ToolStepInput & {
  toolUseId?: string;
  agentId?: string;
  providerId?: ProviderId;
  taskId?: string;
  workspaceId?: string;
}): AgentStep {
  const parsed = parseSubagentToolInput({ input: args.input });
  const title = parsed.description ?? parsed.subagentType ?? firstLine(parsed.prompt ?? "") ?? "";
  const sentence = describeToolSentence(args.toolName, args.input, { cwd: args.cwd });
  const child: AgentChildRef = {
    kind: "subagent",
    title: title || sentence.done,
    ...(args.taskId ? { taskId: args.taskId } : {}),
    ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    ...(args.toolUseId ? { toolUseId: args.toolUseId } : {}),
    ...(args.agentId ? { agentId: args.agentId } : {}),
    ...(args.providerId ? { providerId: args.providerId } : {}),
  };
  return {
    ...toolStep(args),
    kind: "subagent",
    doing: sentence.doing,
    done: sentence.done,
    childId: `subagent:${args.agentId ?? args.toolUseId ?? args.id}`,
    child,
    ...(parsed.prompt ? { text: parsed.prompt } : {}),
  };
}

/** The agent id a Claude spawn's answer names (`agentId: …`), when it does. */
export function readSpawnedAgentId(output: string | undefined): string | undefined {
  return output ? /\bagentId:\s*([A-Za-z0-9_-]{4,})/.exec(output)?.[1] : undefined;
}
