import { createHash } from "node:crypto";
import path from "node:path";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudePermissionMode } from "./claude-permission-policy";
import {
  WORKSPACE_SCRATCH_AGENTS_DIRECTORY,
  WORKSPACE_SCRATCH_DIRECTORY,
  buildWorkspaceScratchSubagentInstruction,
} from "../../src/lib/workspace-scratch";

/**
 * Claude's sub-agent hooks:
 *
 * - a PreToolUse hook on the `Agent` tool
 *   that forces sub-agents into the foreground, except in auto mode;
 * - a SubagentStart hook that tells each sub-agent, as added context, to keep
 *   its own sub-agents in the foreground and, in turns that use the workspace
 *   scratch folder, where to keep its own output.
 *
 * In auto mode, the server reviews the call the model wrote. Changing the
 * input afterward can leave the CLI without a verdict and cause a denial.
 * SubagentStart delivers scratch instructions after the call is authorized.
 *
 * Used by: `buildClaudeQueryOptions` in `claude-sdk-runtime.ts`.
 */

function isAgentToolName(name: string): boolean {
  return name.trim().toLowerCase() === "agent";
}

/**
 * Rewrite built-in Agent tool inputs so spawned subagents run in the
 * foreground.
 *
 * Recent Claude Code CLIs run Agent-tool subagents in the background by
 * default and tell the model "you will be notified when it completes". That
 * notification can only reach the model while the turn is still streaming —
 * the runtime can wait only while the CLI keeps the query open for its
 * background tasks. Setting `run_in_background: false` lets the parent get
 * the result directly from the tool call. Parallel fan-out still works:
 * multiple foreground Agent calls in one assistant message run concurrently.
 *
 * Returns the rewritten input, or undefined when no rewrite is needed.
 */
export function resolveClaudeForegroundSubagentInput(args: {
  toolName: string;
  input: unknown;
}): Record<string, unknown> | undefined {
  if (!isAgentToolName(args.toolName)) {
    return undefined;
  }
  if (
    typeof args.input !== "object" ||
    args.input === null ||
    Array.isArray(args.input)
  ) {
    return undefined;
  }
  const input = args.input as Record<string, unknown>;
  if (input.run_in_background === false) {
    return undefined;
  }
  // Remote isolation always runs in the background at the CLI level; a
  // foreground rewrite would be contradictory, so leave the input untouched.
  if (input.isolation === "remote") {
    return undefined;
  }
  return { ...input, run_in_background: false };
}

/**
 * Builds the PreToolUse hook for the sub-agent tool. It returns only
 * `updatedInput`, never a `permissionDecision`, so the CLI applies the
 * rewrite and then continues through the normal permission flow (canUseTool,
 * plan-mode gates) for the rewritten call. Registered via
 * `buildClaudeQueryOptions` because the Agent tool is auto-allowed by the CLI
 * and never reaches the canUseTool callback where other input normalization
 * happens.
 *
 * In auto mode it changes nothing: the system prompt asks the lead to write
 * `run_in_background: false` itself, and the CLI keeps a turn open after its
 * `result` for a sub-agent that still runs in the background, within the
 * CLI's own time limit (see `claude-background-hold.ts`).
 */
export function createClaudeSubagentPreToolUseHook(options: { permissionMode?: ClaudePermissionMode } = {}): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") {
      return {};
    }
    // The CLI's effective mode can differ from the mode requested at startup.
    const permissionMode = input.permission_mode?.trim() || options.permissionMode;
    if (permissionMode === "auto") {
      return {};
    }
    const updatedInput = resolveClaudeForegroundSubagentInput({
      toolName: input.tool_name,
      input: input.tool_input,
    });
    if (!updatedInput) {
      return {};
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput,
      },
    };
  };
}

/**
 * The sub-agent's scratch folder name: a slug of its agent type (so the
 * Scratch panel's group reads as what kind of worker it is) plus a short hash
 * of its agent id, so two sub-agents of the same type never share a folder.
 */
export function claudeSubagentScratchId(args: { agentId: string; agentType?: unknown }): string {
  const hash = createHash("sha1").update(args.agentId).digest("hex").slice(0, 6);
  const slug = typeof args.agentType === "string"
    ? args.agentType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "")
    : "";
  return slug ? `${slug}-${hash}` : hash;
}

/**
 * What a sub-agent is told when it starts. Model-facing, so English only.
 */
export const CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION =
  "When you start a local subagent with the Agent tool, set `run_in_background: false` so its result comes back in the tool call.";

/**
 * The context a sub-agent starts with: the foreground rule, plus a line naming
 * its own scratch folder, `<scratchRoot>/.stave/scratch/agents/<id>/`, when
 * `scratchRoot` is an absolute workspace path. The folder hangs off the
 * workspace root Stave watches, not the sub-agent's working directory, so a
 * sub-agent in an isolated worktree still writes where the panel looks.
 */
export function resolveClaudeSubagentStartContext(args: {
  agentId: string;
  agentType?: unknown;
  scratchRoot?: string;
}): string {
  const lines = [CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION];
  if (args.scratchRoot && path.isAbsolute(args.scratchRoot) && args.agentId) {
    const folder = `${path.join(
      args.scratchRoot,
      WORKSPACE_SCRATCH_DIRECTORY,
      WORKSPACE_SCRATCH_AGENTS_DIRECTORY,
      claudeSubagentScratchId({ agentId: args.agentId, agentType: args.agentType }),
    )}${path.sep}`;
    lines.push(buildWorkspaceScratchSubagentInstruction(folder));
  }
  return lines.join("\n\n");
}

/**
 * Builds the SubagentStart hook. Added context reaches the sub-agent without
 * changing the Agent call, so auto mode's review of that call still holds.
 * `scratchRoot` is omitted for read-only and tool-less turns, which neither
 * make the scratch folder nor mention it.
 */
export function createClaudeSubagentStartHook(options: { scratchRoot?: string } = {}): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "SubagentStart") {
      return {};
    }
    return {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: resolveClaudeSubagentStartContext({
          agentId: input.agent_id,
          agentType: input.agent_type,
          scratchRoot: options.scratchRoot,
        }),
      },
    };
  };
}
