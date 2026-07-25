/**
 * Codex thread-goal state plus the `/goal` and `/compact` chat slash commands.
 *
 * Extracted verbatim from `codex-app-server-runtime.ts` to keep that file within
 * the max-lines ratchet; no behavior changed. `codex-app-server-runtime` still
 * re-exports the public names for existing consumers.
 */
import type {
  ProviderGoalSnapshot,
  ProviderGoalStatus,
} from "../../src/lib/providers/provider.types";
import type { BridgeEvent } from "./types";
import {
  toCodexUserFacingErrorMessage,
  toErrorMessage,
} from "./codex-app-server-errors";
import { resolveGitHeadRef } from "./git-head-ref";

/** Minimal request-capable slice of the Codex App Server client. */
export type CodexElicitationPauseClient = {
  request<T = unknown>(method: string, params: unknown): Promise<T>;
};

export type CodexThreadGoalStatus = ProviderGoalStatus;

export interface CodexThreadGoal {
  threadId: string;
  objective: string;
  status: CodexThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export type CodexGoalSlashCommand =
  | { kind: "get" }
  | { kind: "clear" }
  | { kind: "set"; objective: string }
  | { kind: "status"; status: "active" | "paused" };

export function parseCodexGoalSlashCommand(
  input: string,
): CodexGoalSlashCommand | null {
  const match = input.trim().match(/^\/goal(?:\s+([\s\S]*))?$/i);
  if (!match) {
    return null;
  }

  const argument = (match[1] ?? "").trim();
  if (!argument) {
    return { kind: "get" };
  }

  const normalizedArgument = argument.toLowerCase();
  if (normalizedArgument === "clear") {
    return { kind: "clear" };
  }
  if (normalizedArgument === "pause") {
    return { kind: "status", status: "paused" };
  }
  if (normalizedArgument === "resume") {
    return { kind: "status", status: "active" };
  }

  return { kind: "set", objective: argument };
}

function formatCodexGoalStatus(status: CodexThreadGoalStatus) {
  switch (status) {
    case "usageLimited":
      return "usage limited";
    case "budgetLimited":
      return "budget limited";
    default:
      return status;
  }
}

function formatCodexGoalElapsedTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0s";
  }
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function formatCodexGoal(goal: CodexThreadGoal) {
  const tokenBudget =
    typeof goal.tokenBudget === "number" && goal.tokenBudget > 0
      ? ` / ${goal.tokenBudget}`
      : "";
  return [
    `Codex goal: ${goal.objective}`,
    `Status: ${formatCodexGoalStatus(goal.status)}`,
    `Usage: ${goal.tokensUsed}${tokenBudget} tokens, ${formatCodexGoalElapsedTime(goal.timeUsedSeconds)}`,
  ].join("\n");
}

function isCodexThreadGoalStatus(
  value: unknown,
): value is CodexThreadGoalStatus {
  return (
    value === "active" ||
    value === "paused" ||
    value === "blocked" ||
    value === "usageLimited" ||
    value === "budgetLimited" ||
    value === "complete"
  );
}

function normalizeGoalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeCodexThreadGoal(value: unknown): CodexThreadGoal | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const goal = value as Record<string, unknown>;
  const threadId =
    typeof goal.threadId === "string" ? goal.threadId.trim() : "";
  const objective =
    typeof goal.objective === "string" ? goal.objective.trim() : "";
  if (!threadId || !objective || !isCodexThreadGoalStatus(goal.status)) {
    return null;
  }
  const rawTokenBudget = goal.tokenBudget;
  return {
    threadId,
    objective,
    status: goal.status,
    tokenBudget:
      typeof rawTokenBudget === "number" && Number.isFinite(rawTokenBudget)
        ? rawTokenBudget
        : null,
    tokensUsed: normalizeGoalNumber(goal.tokensUsed),
    timeUsedSeconds: normalizeGoalNumber(goal.timeUsedSeconds),
    createdAt: normalizeGoalNumber(goal.createdAt),
    updatedAt: normalizeGoalNumber(goal.updatedAt),
  };
}

export function mapCodexThreadGoalToProviderGoal(
  goal: CodexThreadGoal,
): ProviderGoalSnapshot {
  return {
    providerId: "codex",
    nativeSessionId: goal.threadId,
    objective: goal.objective,
    status: goal.status,
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

export function buildCodexGoalStatusEvent(goal: CodexThreadGoal | null): BridgeEvent {
  return {
    type: "goal_status",
    providerId: "codex",
    goal: goal ? mapCodexThreadGoalToProviderGoal(goal) : null,
  };
}

export async function readCodexGoalStatusEvent(args: {
  client: CodexElicitationPauseClient;
  threadId: string;
}): Promise<BridgeEvent | null> {
  try {
    const response = await args.client.request<{
      goal: CodexThreadGoal | null;
    }>("thread/goal/get", {
      threadId: args.threadId,
    });
    return buildCodexGoalStatusEvent(response.goal);
  } catch (error) {
    console.warn("[provider-runtime] Codex goal status sync failed", {
      threadId: args.threadId,
      error: toErrorMessage(error),
    });
    return null;
  }
}

export async function runCodexGoalSlashCommand(args: {
  client: CodexElicitationPauseClient;
  threadId: string;
  input: string;
}): Promise<BridgeEvent[] | null> {
  const command = parseCodexGoalSlashCommand(args.input);
  if (!command) {
    return null;
  }

  try {
    if (command.kind === "get") {
      const response = await args.client.request<{
        goal: CodexThreadGoal | null;
      }>("thread/goal/get", {
        threadId: args.threadId,
      });
      return [
        buildCodexGoalStatusEvent(response.goal),
        {
          type: "text",
          text: response.goal
            ? formatCodexGoal(response.goal)
            : "No Codex goal is set for this thread.",
        },
        { type: "done" },
      ];
    }

    if (command.kind === "clear") {
      const response = await args.client.request<{ cleared: boolean }>(
        "thread/goal/clear",
        {
          threadId: args.threadId,
        },
      );
      return [
        buildCodexGoalStatusEvent(null),
        {
          type: "text",
          text: response.cleared
            ? "Cleared the Codex goal."
            : "No Codex goal was set for this thread.",
        },
        { type: "done" },
      ];
    }

    if (command.kind === "status") {
      const current = await args.client.request<{
        goal: CodexThreadGoal | null;
      }>("thread/goal/get", {
        threadId: args.threadId,
      });
      if (!current.goal) {
        return [
          buildCodexGoalStatusEvent(null),
          {
            type: "text",
            text: "No Codex goal is set for this thread.",
          },
          { type: "done" },
        ];
      }
      const response = await args.client.request<{ goal: CodexThreadGoal }>(
        "thread/goal/set",
        {
          threadId: args.threadId,
          status: command.status,
        },
      );
      return [
        buildCodexGoalStatusEvent(response.goal),
        {
          type: "text",
          text: `${command.status === "paused" ? "Paused" : "Resumed"} the Codex goal.\n\n${formatCodexGoal(response.goal)}`,
        },
        { type: "done" },
      ];
    }

    const response = await args.client.request<{ goal: CodexThreadGoal }>(
      "thread/goal/set",
      {
        threadId: args.threadId,
        objective: command.objective,
        status: "active",
      },
    );
    return [buildCodexGoalStatusEvent(response.goal), { type: "done" }];
  } catch (error) {
    return [
      {
        type: "error",
        message: toCodexUserFacingErrorMessage({
          message: toErrorMessage(error),
        }),
        recoverable: true,
      },
      { type: "done" },
    ];
  }
}

const CODEX_COMPACT_SLASH_COMMAND_PATTERN = /^\/compact(?:\s|$)/i;

export function isCodexCompactSlashCommand(input: string): boolean {
  return CODEX_COMPACT_SLASH_COMMAND_PATTERN.test(input.trimStart());
}

// The Codex App Server does not parse chat slash commands the way the Codex
// TUI does; "/compact" sent as a plain user turn just reaches the model as
// text. Intercept it here and call the dedicated compaction RPC instead, so
// chat "/compact" behaves like the Claude provider's native /compact.
export async function runCodexCompactSlashCommand(args: {
  client: CodexElicitationPauseClient;
  threadId: string;
  input: string;
  cwd?: string;
}): Promise<BridgeEvent[] | null> {
  if (!isCodexCompactSlashCommand(args.input)) {
    return null;
  }

  try {
    await args.client.request("thread/compact/start", {
      threadId: args.threadId,
    });
    const gitRef = args.cwd ? resolveGitHeadRef({ cwd: args.cwd }) : undefined;
    return [
      {
        type: "system",
        content: "Context compacted (manual).",
        compactBoundary: {
          trigger: "manual",
          ...(gitRef ? { gitRef } : {}),
        },
      },
      {
        type: "text",
        text: "Compacted the Codex conversation context. You can continue this thread with the summarized history.",
      },
      { type: "done" },
    ];
  } catch (error) {
    return [
      {
        type: "error",
        message: toCodexUserFacingErrorMessage({
          message: toErrorMessage(error),
        }),
        recoverable: true,
      },
      { type: "done" },
    ];
  }
}
