import { createHash } from "node:crypto";
import path from "node:path";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import {
  WORKSPACE_SCRATCH_AGENTS_DIRECTORY,
  WORKSPACE_SCRATCH_DIRECTORY,
  buildWorkspaceScratchSubagentInstruction,
} from "../../src/lib/workspace-scratch";

/**
 * The in-process PreToolUse hook on Claude's sub-agent tool (`Agent`, `Task`
 * on older CLIs): forces sub-agents into the foreground and, in turns that
 * use the workspace scratch folder, tells each sub-agent where to keep its
 * own output.
 *
 * Used by: `buildClaudeQueryOptions` in `claude-sdk-runtime.ts`.
 */

function isAgentToolName(name: string): boolean {
  return name.trim().toLowerCase() === "agent";
}

function isSubagentToolName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "agent" || normalized === "task";
}

/**
 * Rewrite built-in Agent tool inputs so spawned subagents run in the
 * foreground.
 *
 * Recent Claude Code CLIs run Agent-tool subagents in the background by
 * default and tell the model "you will be notified when it completes". That
 * notification can only reach the model while the turn is still streaming —
 * Stave drives the provider one turn at a time and closes the query once
 * `result` arrives, so a turn that ends "waiting for the notification" stalls
 * forever and the subagent's work is lost. Forcing `run_in_background: false`
 * makes the Agent tool call block until the subagent finishes, so its result
 * always lands inside the live turn. Parallel fan-out still works: multiple
 * foreground Agent calls issued in one assistant message execute concurrently.
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
 * The sub-agent's folder name: a slug of its description (so the Scratch
 * panel's group reads as what it does) plus a short hash of the tool call,
 * so two sub-agents with the same description never share a folder.
 */
export function claudeSubagentScratchId(args: { toolUseId: string; description?: unknown }): string {
  const hash = createHash("sha1").update(args.toolUseId).digest("hex").slice(0, 6);
  const slug = typeof args.description === "string"
    ? args.description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "")
    : "";
  return slug ? `${slug}-${hash}` : hash;
}

/**
 * The sub-agent's brief with a line naming its own scratch folder,
 * `<cwd>/.stave/scratch/agents/<id>/` (absolute, so a sub-agent in an
 * isolated worktree still writes where the panel looks). Undefined when the
 * input has no brief or already names a scratch folder.
 */
export function resolveClaudeSubagentScratchInput(args: {
  toolName: string;
  input: unknown;
  toolUseId: string;
  cwd: string;
}): Record<string, unknown> | undefined {
  if (!isSubagentToolName(args.toolName) || !args.cwd || !path.isAbsolute(args.cwd)) return undefined;
  if (typeof args.input !== "object" || args.input === null || Array.isArray(args.input)) return undefined;
  const input = args.input as Record<string, unknown>;
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return undefined;
  const agentsPrefix = `${WORKSPACE_SCRATCH_DIRECTORY}/${WORKSPACE_SCRATCH_AGENTS_DIRECTORY}/`;
  if (input.prompt.includes(agentsPrefix)) return undefined;
  const folder = `${path.join(args.cwd, ...agentsPrefix.split("/").filter(Boolean), claudeSubagentScratchId({ toolUseId: args.toolUseId, description: input.description }))}${path.sep}`;
  return { ...input, prompt: `${input.prompt.trimEnd()}\n\n${buildWorkspaceScratchSubagentInstruction(folder)}` };
}

/**
 * Builds the PreToolUse hook. It returns only `updatedInput`, never a
 * `permissionDecision`, so the CLI applies the rewrite and then continues
 * through the normal permission flow (canUseTool, plan-mode gates) for the
 * rewritten call. Registered via `buildClaudeQueryOptions` because the Agent
 * tool is auto-allowed by the CLI and never reaches the canUseTool callback
 * where other input normalization happens.
 *
 * `scratch` is false for read-only and tool-less turns, which neither make
 * the scratch folder nor mention it.
 */
export function createClaudeSubagentPreToolUseHook(options: { scratch: boolean }): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") {
      return {};
    }
    const foreground = resolveClaudeForegroundSubagentInput({
      toolName: input.tool_name,
      input: input.tool_input,
    });
    const scratch = options.scratch
      ? resolveClaudeSubagentScratchInput({
          toolName: input.tool_name,
          input: foreground ?? input.tool_input,
          toolUseId: input.tool_use_id,
          cwd: input.cwd,
        })
      : undefined;
    const updatedInput = scratch ?? foreground;
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

/** Foreground rewrite only: read-only and tool-less turns. */
export const claudeForegroundSubagentPreToolUseHook = createClaudeSubagentPreToolUseHook({ scratch: false });

/** Foreground rewrite plus the sub-agent's scratch folder: every other turn. */
export const claudeScratchSubagentPreToolUseHook = createClaudeSubagentPreToolUseHook({ scratch: true });
