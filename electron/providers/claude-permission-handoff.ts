import type { TurnPolicy } from "../../src/lib/policy/turn-policy";
import { isTrustedApproval } from "../../src/lib/providers/trusted-tools";
import { shouldAllowClaudeAutonomousCall, type ClaudeGuardrailHit } from "./claude-guardrail-hook";
import {
  resolveClaudePermissionModeDecision,
  resolveTrustedApprovalInput,
  type ClaudePermissionMode,
} from "./claude-permission-policy";

/** Who answered a call Stave's permission callback allowed without asking. */
export type ClaudeHandoffAllowSource = "permission-mode" | "autonomy" | "trusted";

/** The permission result's message for each kind of allow; diagnostic text only. */
export const CLAUDE_HANDOFF_ALLOW_MESSAGES: Record<ClaudeHandoffAllowSource, (toolName: string) => string> = {
  "permission-mode": (toolName) => `Claude auto-allowed ${toolName}.`,
  autonomy: (toolName) => `Stave autonomy allowed ${toolName}.`,
  trusted: (toolName) => `Claude trusted ${toolName}.`,
};

export type ClaudeHandoffDecision =
  | { action: "allow"; source: ClaudeHandoffAllowSource }
  | { action: "question" }
  | { action: "deny" }
  | { action: "prompt" };

/**
 * What Stave's permission callback does with a call the Claude CLI hands it,
 * once the redirects and denials that come first (an activated skill, a
 * secondary read-only run, the provider-native browser) let it through. Pure.
 *
 * 1. The permission mode's own answer: in `auto`, repository edits, reads and
 *    prompt-free Stave tools pass. A guardrail turns that pass into a prompt.
 * 2. `AskUserQuestion` becomes a question card.
 * 3. A mode that denies without asking denies.
 * 4. A guardrail call always asks; nothing below can approve it.
 * 5. Stave's blanket autonomy, except on an Agent Run stage turn in Claude's
 *    native Auto, whose handoffs belong to the user.
 * 6. A tool or Bash prefix the user trusted.
 * 7. Otherwise the user is asked.
 */
export function resolveClaudeHandoffDecision(args: {
  permissionMode: ClaudePermissionMode;
  toolName: string;
  input: Record<string, unknown>;
  /** Auto only; see `shouldKeepClaudeReadOnlyPrompt`. */
  keepReadOnlyPrompt?: boolean;
  guardrail: ClaudeGuardrailHit | null;
  turnPolicy: TurnPolicy | undefined;
  matchedAskRule?: unknown;
  /** The turn is an Agent Run stage turn. */
  agentRunStage: boolean;
  unattendedAutomation: boolean;
  trustedTools?: readonly string[] | null;
}): ClaudeHandoffDecision {
  const modeDecision = resolveClaudePermissionModeDecision({
    permissionMode: args.permissionMode,
    toolName: args.toolName,
    ...(args.permissionMode === "auto" && args.keepReadOnlyPrompt !== undefined
      ? { keepReadOnlyPrompt: args.keepReadOnlyPrompt }
      : {}),
  });
  if (modeDecision === "allow" && !args.guardrail) return { action: "allow", source: "permission-mode" };
  if (args.toolName === "AskUserQuestion") return { action: "question" };
  if (modeDecision === "deny") return { action: "deny" };
  if (args.guardrail) return { action: "prompt" };
  const nativeAuto = !args.unattendedAutomation && args.permissionMode === "auto" && args.agentRunStage;
  if (shouldAllowClaudeAutonomousCall({ policy: args.turnPolicy, toolName: args.toolName, matchedAskRule: args.matchedAskRule, nativeAuto })) {
    return { action: "allow", source: "autonomy" };
  }
  if (isTrustedApproval({
    trustedTools: args.trustedTools,
    toolName: args.toolName,
    input: resolveTrustedApprovalInput({ toolName: args.toolName, input: args.input }),
  })) {
    return { action: "allow", source: "trusted" };
  }
  return { action: "prompt" };
}
