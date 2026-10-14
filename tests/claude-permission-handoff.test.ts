import { describe, expect, test } from "bun:test";
import { resolveTurnPolicy, type TurnActor } from "../src/lib/policy/turn-policy";
import { resolveClaudeTurnGuardrail } from "../electron/providers/claude-guardrail-hook";
import { resolveClaudeHandoffDecision } from "../electron/providers/claude-permission-handoff";

const ROOT = "/work/repo";
const agent: TurnActor = { kind: "agent", access: "full" };
const autonomous = resolveTurnPolicy({ providerId: "claude-code", actor: agent, options: {}, root: ROOT });

/** A call native Auto handed to the permission callback on an Agent Run stage turn. */
function decide(overrides: {
  toolName: string;
  input?: Record<string, unknown>;
  decisionReason?: string;
  trustedTools?: string[];
  agentRunStage?: boolean;
  unattendedAutomation?: boolean;
  keepReadOnlyPrompt?: boolean;
}) {
  const input = overrides.input ?? {};
  const guardrail = resolveClaudeTurnGuardrail({
    policy: autonomous, toolName: overrides.toolName, input, cwd: ROOT, decisionReason: overrides.decisionReason,
  });
  return resolveClaudeHandoffDecision({
    permissionMode: "auto",
    toolName: overrides.toolName,
    input,
    guardrail,
    turnPolicy: autonomous,
    agentRunStage: overrides.agentRunStage ?? true,
    unattendedAutomation: overrides.unattendedAutomation ?? false,
    trustedTools: overrides.trustedTools ?? [],
    keepReadOnlyPrompt: overrides.keepReadOnlyPrompt ?? false,
  });
}

describe("Claude permission handoff on an Agent Run stage turn in native Auto", () => {
  test("an untrusted Bash call the classifier hands over asks the user", () => {
    expect(autonomous.autonomy).toBe("autonomous");
    // No guardrail is involved: only the native Auto handoff keeps it asking.
    expect(resolveClaudeTurnGuardrail({ policy: autonomous, toolName: "Bash", input: { command: "curl -sS https://example.com/status" }, cwd: ROOT })).toBeNull();
    expect(decide({ toolName: "Bash", input: { command: "curl -sS https://example.com/status" } })).toEqual({ action: "prompt" });
  });

  test("a Bash command under a trusted prefix runs without asking", () => {
    expect(decide({ toolName: "Bash", input: { command: "bun test tests/a.test.ts" }, trustedTools: ["bash:bun test"] }))
      .toEqual({ action: "allow", source: "trusted" });
    expect(decide({ toolName: "Bash", input: { command: "bunx tsc" }, trustedTools: ["bash:bun test"] }))
      .toEqual({ action: "prompt" });
  });

  test("repository edits and reads run without asking", () => {
    expect(decide({ toolName: "Edit", input: { file_path: `${ROOT}/src/a.ts` } }))
      .toEqual({ action: "allow", source: "permission-mode" });
    expect(decide({ toolName: "Read", input: { file_path: `${ROOT}/src/a.ts` } }))
      .toEqual({ action: "allow", source: "permission-mode" });
    // A read the user's own settings keep asking about still asks.
    expect(decide({ toolName: "Read", input: { file_path: `${ROOT}/.env` }, keepReadOnlyPrompt: true }))
      .toEqual({ action: "prompt" });
  });

  test("a prompt-free Stave tool runs without asking; one that answers another task does not", () => {
    expect(decide({ toolName: "mcp__stave-local-mcp__stave_report_stage" }))
      .toEqual({ action: "allow", source: "permission-mode" });
    expect(decide({ toolName: "mcp__stave-local-mcp__stave_respond_user_input" })).toEqual({ action: "prompt" });
  });

  test("a guardrail call is never auto-allowed, even when trusted or otherwise allowed", () => {
    expect(decide({ toolName: "Write", input: { file_path: "/etc/hosts" } })).toEqual({ action: "prompt" });
    expect(decide({ toolName: "Write", input: { file_path: "/etc/hosts" }, trustedTools: ["Write"] })).toEqual({ action: "prompt" });
    expect(decide({
      toolName: "Bash", input: { command: "git push --force origin main" }, trustedTools: ["bash:git push"],
      decisionReason: "Stave guardrail G3: this force-pushes main.",
    })).toEqual({ action: "prompt" });
  });

  test("a question stays a question", () => {
    expect(decide({ toolName: "AskUserQuestion", input: { questions: [] } })).toEqual({ action: "question" });
  });
});

describe("Claude permission handoff outside a native Auto Run stage turn", () => {
  test("an agent-mode turn that is not a Run stage keeps Stave's blanket autonomy", () => {
    expect(decide({ toolName: "Bash", input: { command: "curl -sS https://example.com/status" }, agentRunStage: false }))
      .toEqual({ action: "allow", source: "autonomy" });
  });

  test("an unattended automation Run turn keeps Stave's blanket autonomy", () => {
    expect(decide({ toolName: "Bash", input: { command: "curl -sS https://example.com/status" }, unattendedAutomation: true }))
      .toEqual({ action: "allow", source: "autonomy" });
  });

  test("blanket autonomy still stops at a guardrail", () => {
    expect(decide({ toolName: "Write", input: { file_path: "/etc/hosts" }, agentRunStage: false })).toEqual({ action: "prompt" });
  });

  test("Don't Ask denies what it does not allow, and a chat turn in Default asks", () => {
    const chat = resolveTurnPolicy({ providerId: "claude-code", actor: { kind: "chat" }, options: { claudePermissionMode: "default" }, root: ROOT });
    const base = { toolName: "Bash", input: { command: "ls" }, guardrail: null, agentRunStage: false, unattendedAutomation: false };
    expect(resolveClaudeHandoffDecision({ ...base, permissionMode: "dontAsk", turnPolicy: chat })).toEqual({ action: "deny" });
    expect(resolveClaudeHandoffDecision({ ...base, permissionMode: "default", turnPolicy: chat })).toEqual({ action: "prompt" });
    expect(resolveClaudeHandoffDecision({ ...base, permissionMode: "default", turnPolicy: chat, trustedTools: ["bash:ls"] }))
      .toEqual({ action: "allow", source: "trusted" });
  });
});
