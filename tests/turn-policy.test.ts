import { describe, expect, test } from "bun:test";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import {
  autonomyOfOptions,
  omitPermissionRuntimeOptions,
  resolveTurnPolicy,
  type TurnActor,
  type TurnPolicy,
} from "../src/lib/policy/turn-policy";
import { isReadOnlyDelegationPolicy } from "../src/lib/runs/delegation-policy";
import type { ProviderRuntimeOptions } from "../src/lib/providers/provider.types";
import {
  createClaudeGuardrailPreToolUseHook,
  evaluateClaudeGuardrail,
  guardrailWriteRoots,
  resolveClaudeTurnGuardrail,
  shouldAllowClaudeAutonomousCall,
  withClaudeTurnGuardrails,
  type ClaudeGuardrailContext,
} from "../electron/providers/claude-guardrail-hook";
import { resolveClaudePermissionModeDecision } from "../electron/providers/claude-permission-policy";
import { shouldAutoApproveStaveLocalMcpElicitation } from "../electron/providers/codex-elicitation-mapping";
import { applyTurnPolicy } from "../electron/providers/turn-policy-entry";
import {
  assertMcpAutomationEnabledChange,
  mcpAutomationCreateInput,
  mcpAutomationUpdateInput,
  McpRunTaskRuntimeOptionsSchema,
} from "../electron/main/stave-mcp-autonomy-guards";
import type { AutomationUpsertInput } from "../src/lib/automations";

const ROOT = "/work/repo";
const chat: TurnActor = { kind: "chat" };
const agent: TurnActor = { kind: "agent", access: "full" };
const readOnlyAgent: TurnActor = { kind: "agent", access: "read-only" };

function resolve(providerId: "claude-code" | "codex" | "cursor", actor: TurnActor, options: ProviderRuntimeOptions = {}) {
  return resolveTurnPolicy({ providerId, actor, options, root: ROOT });
}

describe("turn policy mapping: Claude", () => {
  test("chat keeps the user's settings and derives autonomy from the preset", () => {
    expect(resolve("claude-code", chat, { claudePermissionMode: "default" })).toMatchObject({ autonomy: "ask", options: {}, source: "user-settings" });
    expect(resolve("claude-code", chat, { claudePermissionMode: "acceptEdits" })).toMatchObject({ autonomy: "ask", options: {} });
    expect(resolve("claude-code", chat, { claudePermissionMode: "auto" })).toMatchObject({ autonomy: "autonomous", options: {} });
    expect(resolve("claude-code", chat, {
      claudePermissionMode: "bypassPermissions", claudeAllowDangerouslySkipPermissions: true,
    })).toMatchObject({ autonomy: "autonomous", options: {} });
  });

  test("an agent runs on native auto and keeps the user's sandbox, deny and credential settings", () => {
    const policy = resolve("claude-code", agent, {
      claudePermissionMode: "default", claudeSandboxEnabled: true, claudeAllowUnsandboxedCommands: false,
      claudeDisallowedTools: ["WebFetch"], claudeSandboxCredentialFiles: ["~/.secrets"], claudeSandboxCredentialEnvVars: ["API_TOKEN"],
    });
    expect(policy.autonomy).toBe("autonomous");
    expect(policy.options).toEqual({ claudePermissionMode: "auto", claudeAgentTurn: true });
    expect(policy.guardrails).toEqual({ root: ROOT, credentialFiles: ["~/.secrets"], credentialEnvVars: ["API_TOKEN"], enabled: ["G1", "G2", "G3"] });
    expect(policy.source).toBe("agent");
  });

  test("an agent keeps Bypass, Don't Ask and Auto as the user chose them", () => {
    for (const mode of ["bypassPermissions", "dontAsk", "auto"] as const) {
      expect(resolve("claude-code", agent, { claudePermissionMode: mode })).toMatchObject({ autonomy: "autonomous", options: { claudeAgentTurn: true } });
      expect(resolve("claude-code", agent, { claudePermissionMode: mode }).options).not.toHaveProperty("claudePermissionMode");
    }
  });

  test("a read-only agent gets the read-only posture, carrying the user's denials", () => {
    const policy = resolve("claude-code", readOnlyAgent, {
      claudePermissionMode: "bypassPermissions", claudeDisallowedTools: ["WebFetch"], claudeSandboxCredentialFiles: ["~/.secrets"],
    });
    expect(policy.autonomy).toBe("read-only");
    const merged = { claudePermissionMode: "bypassPermissions" as const, ...policy.options };
    expect(isReadOnlyDelegationPolicy("claude-code", { providerId: "claude-code", options: merged })).toBe(true);
    expect(policy.options.claudeDisallowedTools).toContain("WebFetch");
    expect(policy.options.claudeSandboxCredentialFiles).toEqual(["~/.secrets"]);
  });

  test("an options set already in the read-only posture stays read-only for any actor", () => {
    const posture = { ...resolve("claude-code", readOnlyAgent).options } as ProviderRuntimeOptions;
    expect(autonomyOfOptions("claude-code", posture)).toBe("read-only");
    expect(resolve("claude-code", agent, posture)).toMatchObject({ autonomy: "read-only", options: {} });
  });
});

describe("turn policy mapping: Codex", () => {
  test("chat: only `never` is autonomous", () => {
    expect(resolve("codex", chat, { codexApprovalPolicy: "untrusted" })).toMatchObject({ autonomy: "ask", options: {} });
    expect(resolve("codex", chat, { codexApprovalPolicy: "on-request" })).toMatchObject({ autonomy: "ask" });
    expect(resolve("codex", chat, { codexApprovalPolicy: "never", codexFileAccess: "workspace-write" }).autonomy).toBe("autonomous");
  });

  test("an agent never asks, writes at least the workspace, and keeps network as set", () => {
    const policy = resolve("codex", agent, { codexApprovalPolicy: "untrusted", codexFileAccess: "read-only", codexNetworkAccess: false });
    expect(policy.autonomy).toBe("autonomous");
    expect(policy.options).toEqual({
      codexApprovalPolicy: "never", codexFileAccess: "workspace-write", codexAutoApproveStaveLocalMcpTools: true, codexAgentTurn: true,
    });
    expect(policy.options).not.toHaveProperty("codexNetworkAccess");
  });

  test("an agent keeps the user's full access", () => {
    expect(resolve("codex", agent, { codexFileAccess: "danger-full-access" }).options.codexFileAccess).toBe("danger-full-access");
  });

  test("a read-only agent gets the read-only sandbox that never asks", () => {
    expect(resolve("codex", readOnlyAgent, { codexFileAccess: "danger-full-access", codexNetworkAccess: true })).toMatchObject({
      autonomy: "read-only",
      options: { codexFileAccess: "read-only", codexApprovalPolicy: "never", codexNetworkAccess: false, codexAutoApproveStaveLocalMcpTools: false },
    });
  });
});

describe("turn policy mapping: helpers, spawned turns, other providers", () => {
  test("a helper takes its parent's autonomy and a read-only helper stays read-only", () => {
    for (const providerId of ["claude-code", "codex"] as const) {
      expect(resolve(providerId, { kind: "helper", parent: "autonomous", access: "inherit" }).autonomy).toBe("autonomous");
      expect(resolve(providerId, { kind: "helper", parent: "ask", access: "inherit" })).toMatchObject({ autonomy: "ask", options: {} });
      expect(resolve(providerId, { kind: "helper", parent: "autonomous", access: "read-only" }).autonomy).toBe("read-only");
      expect(resolve(providerId, { kind: "helper", parent: "read-only", access: "inherit" }).autonomy).toBe("read-only");
    }
    // Narrowing: an ask parent never lets an autonomous-looking child skip prompts it would not grant.
    expect(resolve("claude-code", { kind: "helper", parent: "ask", access: "inherit" }, { claudePermissionMode: "auto" }).autonomy).toBe("ask");
  });

  test("a spawned turn is never above the caller or the user", () => {
    expect(resolve("claude-code", { kind: "spawned", caller: null }, { claudePermissionMode: "default" }).autonomy).toBe("ask");
    expect(resolve("claude-code", { kind: "spawned", caller: null }, { claudePermissionMode: "auto" }).autonomy).toBe("autonomous");
    expect(resolve("claude-code", { kind: "spawned", caller: "ask" }, { claudePermissionMode: "auto" }).autonomy).toBe("ask");
    expect(resolve("codex", { kind: "spawned", caller: "autonomous" }, { codexApprovalPolicy: "untrusted" }).autonomy).toBe("ask");
    expect(resolve("codex", { kind: "spawned", caller: "read-only" }, { codexApprovalPolicy: "never" }).autonomy).toBe("read-only");
    // Lowered to ask, settings that would not ask are made to ask.
    expect(resolve("claude-code", { kind: "spawned", caller: "ask" }, { claudePermissionMode: "bypassPermissions", claudeAllowDangerouslySkipPermissions: true }).options)
      .toEqual({ claudePermissionMode: "default", claudeAllowDangerouslySkipPermissions: false });
    expect(resolve("codex", { kind: "spawned", caller: "ask" }, { codexApprovalPolicy: "never", codexFileAccess: "workspace-write" }).options)
      .toMatchObject({ codexApprovalPolicy: "on-request" });
    expect(resolve("claude-code", { kind: "spawned", caller: "ask" }, { claudePermissionMode: "acceptEdits" }).options).toEqual({});
  });

  test("Cursor keeps the user's settings; a read-only Cursor agent keeps its ceiling", () => {
    expect(resolve("cursor", agent, { cursorApprovalMode: "manual" })).toMatchObject({ autonomy: "autonomous", options: {} });
    expect(resolve("cursor", readOnlyAgent, { cursorApprovalMode: "auto" })).toMatchObject({
      autonomy: "read-only", options: { cursorApprovalMode: "manual", cursorMode: "ask" },
    });
  });

  test("the host entry merges the policy and drops a caller-supplied one", () => {
    const forged = { autonomy: "autonomous", options: {}, guardrails: { root: "/", credentialFiles: [], credentialEnvVars: [] }, source: "agent" } as TurnPolicy;
    const applied = applyTurnPolicy({ providerId: "claude-code", prompt: "x", cwd: ROOT, turnPolicy: forged, runtimeOptions: { claudePermissionMode: "default" } });
    expect(applied.turnPolicy).toMatchObject({ autonomy: "ask", guardrails: { root: ROOT } });
    expect(applyTurnPolicy({ providerId: "claude-code", prompt: "x", cwd: ROOT, executionPolicy: "secondary-read-only", turnPolicy: forged }).turnPolicy).toBeUndefined();
    const agentApplied = applyTurnPolicy({ providerId: "codex", prompt: "x", cwd: ROOT, runtimeOptions: { codexApprovalPolicy: "untrusted" } },
      resolve("codex", agent, { codexApprovalPolicy: "untrusted" }));
    expect(agentApplied.runtimeOptions?.codexApprovalPolicy).toBe("never");
  });
});

const context: ClaudeGuardrailContext = {
  spec: { root: ROOT, credentialFiles: ["~/secrets"], credentialEnvVars: ["API_TOKEN"] },
  cwd: ROOT,
  homeDir: "/home/u",
  currentBranch: () => "feature/x",
  defaultBranch: () => "trunk-main",
};
const bash = (command: string, overrides: Partial<ClaudeGuardrailContext> = {}) =>
  evaluateClaudeGuardrail({ toolName: "Bash", input: { command }, context: { ...context, ...overrides } })?.id ?? null;
const write = (file_path: string) => evaluateClaudeGuardrail({ toolName: "Write", input: { file_path, content: "x" }, context })?.id ?? null;

describe("Claude guardrails", () => {
  test("G1: writes outside the workspace stop; the workspace, .stave/context and temp dirs do not", () => {
    expect(write("/etc/hosts")).toBe("G1");
    expect(write("../other-repo/a.ts")).toBe("G1");
    expect(write(`${ROOT}/src/a.ts`)).toBeNull();
    expect(write(".stave/context/plans/plan.md")).toBeNull();
    expect(write("/tmp/scratch.txt")).toBeNull();
    expect(bash("echo hi > /etc/motd")).toBe("G1");
    expect(bash("echo hi >> ~/.zshrc")).toBe("G1");
    expect(bash("cp build/app /usr/local/bin/app")).toBe("G1");
    expect(bash("cd /var/other && rm -rf build")).toBe("G1");
    expect(bash("rm -rf ./build && mkdir -p dist")).toBeNull();
    expect(bash("bun test 2>&1 > /dev/null")).toBeNull();
    expect(bash("cat > notes.txt <<'EOF'\nwrite to /etc/passwd\nEOF")).toBeNull();
  });

  test("G1: the boundary is the repository — its checkouts, worktrees and ../.worktrees/<repo>", () => {
    const repo = "/repo";
    const worktree = `${repo}/.stave/workspaces/fix__a`;
    expect(guardrailWriteRoots(worktree, { homeDir: "/home/u" })).toEqual(expect.arrayContaining([
      worktree, `${repo}/.stave/workspaces`, repo, "/.worktrees/repo",
    ]));
    const inWorktree = { ...context, spec: { ...context.spec, root: worktree }, cwd: worktree };
    const writeFrom = (file_path: string, overrides: Partial<ClaudeGuardrailContext> = {}) =>
      evaluateClaudeGuardrail({ toolName: "Write", input: { file_path, content: "x" }, context: { ...inWorktree, ...overrides } })?.id ?? null;
    expect(writeFrom(`${repo}/.stave/workspaces/fix__b/src/a.ts`)).toBeNull();
    expect(writeFrom(`${repo}/src/a.ts`)).toBeNull();
    expect(writeFrom("/.worktrees/repo/release-1.0/package.json")).toBeNull();
    expect(writeFrom("/other-repo/.stave/workspaces/x/a.ts")).toBe("G1");
    // Cleanup may rmdir the empty ../.worktrees folder, never delete it or another repository's worktrees in it.
    expect(bash("rmdir /.worktrees/repo /.worktrees", { spec: inWorktree.spec, cwd: worktree })).toBeNull();
    expect(bash("rm -rf /.worktrees", { spec: inWorktree.spec, cwd: worktree })).toBe("G1");
    expect(writeFrom("/.worktrees")).toBe("G1");
    expect(writeFrom("/.worktrees/other/a.ts")).toBe("G1");
    // A handoff plan may go to another repository's Stave workspace; nothing else there may.
    expect(writeFrom("/other-repo/.stave/workspaces/x/.stave/context/plans/handoff_1.md")).toBeNull();
    expect(bash("mkdir -p /other-repo/.stave/workspaces/x/.stave/context/plans", { spec: inWorktree.spec, cwd: worktree })).toBeNull();
    expect(writeFrom("/other-repo/.stave/workspaces/x/.stave/context/a.md")).toBe("G1");
    expect(writeFrom("/etc/.stave/context/plans/x")).toBe("G1");
    expect(writeFrom("/home/u/.stave/workspaces/.stave/context/plans/x")).toBe("G1");
    // A worktree git reports anywhere on disk is part of the repository.
    const gitWorktrees = { repositoryRoots: () => ["/repo", "/elsewhere/wt"] };
    expect(writeFrom("/elsewhere/wt/a.ts")).toBe("G1");
    expect(writeFrom("/elsewhere/wt/a.ts", gitWorktrees)).toBeNull();
    // A worktree added after the list was cached is re-read before G1 stops.
    let added = false;
    const freshOnly = { repositoryRoots: (_root: string, options?: { refresh?: boolean }) =>
      added && options?.refresh ? ["/repo", "/elsewhere/new"] : ["/repo"] };
    expect(writeFrom("/elsewhere/new/a.ts", freshOnly)).toBe("G1");
    added = true;
    expect(writeFrom("/elsewhere/new/a.ts", freshOnly)).toBeNull();
    // From a plain checkout, git names the main checkout and its worktrees.
    const inCheckout = { ...context, spec: { ...context.spec, root: "/src/app" }, cwd: "/src/app", repositoryRoots: () => ["/src/app"] };
    expect(evaluateClaudeGuardrail({ toolName: "Write", input: { file_path: "/src/.worktrees/app/b/a.ts" }, context: inCheckout })).toBeNull();
    expect(evaluateClaudeGuardrail({ toolName: "Write", input: { file_path: "/src/other/a.ts" }, context: inCheckout })?.id).toBe("G1");
    // Claude's own project folder (auto memory) and tool caches are not workspace escapes.
    expect(write("/home/u/.claude/projects/x/memory/note.md")).toBeNull();
    expect(write("/home/u/.claude/plans/plan.md")).toBeNull();
    expect(write("/home/u/.claude/settings.json")).toBe("G1");
    expect(write("/home/u/.cache/tool/state")).toBeNull();
  });

  test("guardrails run only in Agent mode: all three by default, each one can be turned off", () => {
    const only = (claudeGuardrails: ProviderRuntimeOptions["claudeGuardrails"]) =>
      ({ ...context, spec: { ...context.spec, enabled: resolve("claude-code", agent, { claudeGuardrails }).guardrails.enabled } });
    const check = (toolName: string, input: Record<string, unknown>, ctx: ClaudeGuardrailContext) =>
      evaluateClaudeGuardrail({ toolName, input, context: ctx })?.id ?? null;
    expect(only(undefined).spec.enabled).toEqual(["G1", "G2", "G3"]);
    // A chat turn runs none, whatever its mode or setting: model mode is unchanged.
    for (const claudePermissionMode of ["default", "auto", "bypassPermissions"] as const) {
      expect(resolve("claude-code", chat, { claudePermissionMode, claudeGuardrails: ["G1", "G2", "G3"] }).guardrails.enabled).toEqual([]);
      expect(resolve("claude-code", chat, { claudePermissionMode }).options).not.toHaveProperty("claudeAgentTurn");
    }
    expect(resolve("claude-code", readOnlyAgent).options).not.toHaveProperty("claudeAgentTurn");
    expect(resolve("codex", agent).options).not.toHaveProperty("claudeAgentTurn");
    expect(resolve("codex", agent).options).toMatchObject({ codexAgentTurn: true });
    // A turn an Agent started through Local MCP stays in Agent mode; one a chat turn started does not.
    const spawned = (callerAgentMode: boolean) => resolve("claude-code", { kind: "spawned", caller: "autonomous", callerAgentMode }, { claudePermissionMode: "bypassPermissions" });
    expect(spawned(true).guardrails.enabled).toEqual(["G1", "G2", "G3"]);
    expect(spawned(true).options).toMatchObject({ claudeAgentTurn: true });
    expect(spawned(false).guardrails.enabled).toEqual([]);
    // A helper an Agent delegated carries the marker and runs the same guardrails.
    expect(resolve("claude-code", chat, { claudePermissionMode: "auto", claudeAgentTurn: true, claudeGuardrails: ["G3"] }).guardrails.enabled).toEqual(["G3"]);
    expect(resolve("claude-code", chat, { claudePermissionMode: "auto", claudeAgentTurn: true }).guardrails.enabled).toEqual(["G1", "G2", "G3"]);
    const none = only([]);
    expect(none.spec.enabled).toEqual([]);
    expect(check("Write", { file_path: "/etc/hosts" }, none)).toBeNull();
    expect(check("Read", { file_path: "~/.ssh/id_ed25519" }, none)).toBeNull();
    expect(check("Bash", { command: "git push --force origin main" }, none)).toBeNull();
    const g3 = only(["G3"]);
    expect(check("Write", { file_path: "/etc/hosts" }, g3)).toBeNull();
    expect(check("Bash", { command: "git push --force origin main" }, g3)).toBe("G3");
    const g1 = only(["G1"]);
    expect(check("Write", { file_path: "/home/u/.ssh/config" }, g1)).toBe("G1");
    expect(check("Read", { file_path: "~/.ssh/id_ed25519" }, g1)).toBeNull();
    expect(only(["G2"]).spec.enabled).toEqual(["G2"]);
    expect(check("Write", { file_path: "/home/u/.ssh/config" }, only(["G2"]))).toBe("G2");
  });

  test("G1: sed -i rewrites its files, never its script", () => {
    expect(bash("sed -i '' '/pattern/d' src/a.ts")).toBeNull();
    expect(bash("sed -i 's/a/b/' src/a.ts")).toBeNull();
    expect(bash("sed -i -e 's/a/b/' src/a.ts")).toBeNull();
    expect(bash("sed -i '' 's/a/b/' /etc/hosts")).toBe("G1");
    expect(bash("sed -i -e 's/a/b/' /etc/hosts")).toBe("G1");
  });

  test("G2: credential paths and env stop", () => {
    expect(evaluateClaudeGuardrail({ toolName: "Read", input: { file_path: "~/.ssh/id_ed25519" }, context })?.id).toBe("G2");
    expect(evaluateClaudeGuardrail({ toolName: "Read", input: { file_path: `${ROOT}/README.md` }, context })).toBeNull();
    expect(write("/home/u/secrets/token")).toBe("G2");
    expect(bash("cat ~/.aws/credentials")).toBe("G2");
    expect(bash("echo $API_TOKEN")).toBe("G2");
    expect(bash("printenv")).toBe("G2");
    expect(bash("echo $PATH")).toBeNull();
  });

  test("G3: irreversible remote effects stop", () => {
    expect(bash("git push --force origin main")).toBe("G3");
    expect(bash("git push origin +master")).toBe("G3");
    expect(bash("git push -f", { currentBranch: () => "main" })).toBe("G3");
    expect(bash("git push -f", { currentBranch: () => null })).toBe("G3");
    expect(bash("git push --force-with-lease origin trunk-main")).toBe("G3");
    expect(bash("git push --delete origin feature/x")).toBe("G3");
    expect(bash("git push origin :refs/tags/v1.0.0")).toBe("G3");
    expect(bash("git push --mirror backup")).toBe("G3");
    expect(bash("npm publish --access public")).toBe("G3");
    expect(bash("bun publish")).toBe("G3");
    expect(bash("pnpm publish")).toBe("G3");
    expect(bash("yarn npm publish")).toBe("G3");
    expect(bash("cargo publish")).toBe("G3");
    expect(bash("gh release create v1.2.0 --notes x")).toBe("G3");
    expect(bash("gh -R owner/repo release delete v1.2.0")).toBe("G3");
    expect(bash("gh repo delete owner/repo --yes")).toBe("G3");
    expect(bash("gh api -X DELETE repos/o/r/git/refs/heads/x")).toBe("G3");
    expect(bash("sudo rm -rf /")).toBe("G3");
    expect(bash("FOO=1 sudo ls")).toBe("G3");
    expect(bash("bun run build && sudo make install")).toBe("G3");
  });

  test("reversible work is never stopped", () => {
    for (const command of [
      "git push origin feature/x",
      "git push -u origin feature/x",
      "git push --force-with-lease origin feature/x",
      "git push -f",
      "git commit -am 'fix: thing'",
      "gh pr create --fill",
      "gh pr merge 12 --squash --delete-branch",
      "gh release view v1",
      "bun install && bun test",
      "npm run publish-docs",
      "git commit -m \"$(cat <<'EOF'\nchore: sudo npm publish wording\nEOF\n)\"",
    ]) {
      expect({ command, hit: bash(command) }).toEqual({ command, hit: null });
    }
  });

  test("the hook asks with a guardrail reason and is silent otherwise", async () => {
    const hook = createClaudeGuardrailPreToolUseHook(context.spec);
    const call = (tool_name: string, tool_input: Record<string, unknown>) => hook({
      hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t", session_id: "s", transcript_path: "/tmp/t", cwd: ROOT,
    } as never, "t", { signal: new AbortController().signal });
    const asked = await call("Write", { file_path: "/etc/hosts", content: "x" }) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
    expect(asked.hookSpecificOutput?.permissionDecision).toBe("ask");
    expect(asked.hookSpecificOutput?.permissionDecisionReason).toStartWith("Stave guardrail G1");
    expect(await call("Write", { file_path: `${ROOT}/a.ts`, content: "x" })).toEqual({});
    expect(await call("Bash", { command: "gh pr merge 3" })).toEqual({});
  });

  test("the hook is registered first and sandboxed Bash runs unprompted on autonomous turns", () => {
    const base = { sandbox: { enabled: true }, hooks: { PreToolUse: [{ matcher: "^Agent$", hooks: [] }] } } as unknown as Options;
    const autonomous = resolve("claude-code", agent, { claudeGuardrails: ["G1", "G2", "G3"] });
    const options = withClaudeTurnGuardrails(base, autonomous);
    expect(options.hooks?.PreToolUse).toHaveLength(2);
    expect(options.hooks?.PreToolUse?.[0]?.matcher).toBeUndefined();
    expect(options.sandbox?.autoAllowBashIfSandboxed).toBe(true);
    expect(withClaudeTurnGuardrails(base, resolve("claude-code", agent)).hooks?.PreToolUse).toHaveLength(2);
    const off = withClaudeTurnGuardrails(base, resolve("claude-code", agent, { claudeGuardrails: [] }));
    expect(off.hooks?.PreToolUse).toHaveLength(1);
    expect(off.sandbox?.autoAllowBashIfSandboxed).toBe(true);
    // Chat turns never get the hook, even under Bypass with every guardrail chosen.
    const bypassChat = withClaudeTurnGuardrails(base, resolve("claude-code", chat, { claudePermissionMode: "bypassPermissions", claudeGuardrails: ["G1", "G2", "G3"] }));
    expect(bypassChat.hooks?.PreToolUse).toHaveLength(1);
    const ask = withClaudeTurnGuardrails(base, resolve("claude-code", chat, { claudeAgentTurn: true, claudeGuardrails: ["G1"] }));
    expect(ask.hooks?.PreToolUse).toHaveLength(2);
    expect(ask.sandbox?.autoAllowBashIfSandboxed).toBeUndefined();
    expect(withClaudeTurnGuardrails(base, resolve("claude-code", readOnlyAgent))).toBe(base);
    expect(withClaudeTurnGuardrails(base, undefined)).toBe(base);
  });

  test("canUseTool sees the guardrail and answers everything else on autonomous turns", () => {
    const autonomous = resolve("claude-code", agent, { claudeGuardrails: ["G1", "G2", "G3"] });
    expect(resolveClaudeTurnGuardrail({ policy: resolve("claude-code", agent, { claudeGuardrails: [] }), toolName: "Write", input: { file_path: "/etc/x" }, cwd: ROOT })).toBeNull();
    expect(resolveClaudeTurnGuardrail({ policy: resolve("claude-code", chat, { claudePermissionMode: "bypassPermissions" }), toolName: "Write", input: { file_path: "/etc/x" }, cwd: ROOT })).toBeNull();
    expect(resolveClaudeTurnGuardrail({ policy: autonomous, toolName: "Bash", input: { command: "ls" }, cwd: ROOT, decisionReason: "Stave guardrail G3: this force-pushes main." })?.id).toBe("G3");
    expect(resolveClaudeTurnGuardrail({ policy: autonomous, toolName: "Write", input: { file_path: "/etc/x" }, cwd: ROOT })?.id).toBe("G1");
    expect(resolveClaudeTurnGuardrail({ policy: resolve("claude-code", readOnlyAgent), toolName: "Write", input: { file_path: "/etc/x" }, cwd: ROOT })).toBeNull();
    expect(shouldAllowClaudeAutonomousCall({ policy: autonomous, toolName: "Bash" })).toBe(true);
    expect(shouldAllowClaudeAutonomousCall({ policy: autonomous, toolName: "mcp__stave-local-mcp__stave_run_task" })).toBe(true);
    expect(shouldAllowClaudeAutonomousCall({ policy: resolve("claude-code", chat), toolName: "Bash" })).toBe(false);
    expect(shouldAllowClaudeAutonomousCall({ policy: autonomous, toolName: "AskUserQuestion" })).toBe(false);
    expect(shouldAllowClaudeAutonomousCall({ policy: autonomous, toolName: "mcp__stave-local-mcp__stave_respond_user_input" })).toBe(false);
    expect(shouldAllowClaudeAutonomousCall({ policy: autonomous, toolName: "Bash", matchedAskRule: { source: "user", toolName: "Bash" } })).toBe(false);
  });
});

describe("Stave Local MCP privilege holes", () => {
  test("prompt-free Claude modes no longer allow every Stave tool", () => {
    const decide = (permissionMode: "auto" | "dontAsk", tool: string) =>
      resolveClaudePermissionModeDecision({ permissionMode, toolName: `mcp__stave-local-mcp__${tool}` });
    expect(decide("dontAsk", "stave_run_task")).toBe("deny");
    expect(decide("dontAsk", "stave_delegate_task")).toBe("deny");
    expect(decide("dontAsk", "stave_get_task")).toBe("allow");
    expect(decide("auto", "stave_run_task")).toBe("allow");
    expect(decide("auto", "stave_respond_user_input")).toBe("prompt");
  });

  test("Codex never auto-approves a respond tool", () => {
    const params = (toolName: string) => ({
      mode: "form", serverName: "stave-local", message: `Allow the stave-local MCP server to run tool "${toolName}"?`,
      requestedSchema: { type: "object", properties: {} }, _meta: { codex_approval_kind: "mcp_tool_call", tool_name: toolName },
    });
    expect(shouldAutoApproveStaveLocalMcpElicitation({ enabled: true, params: params("stave_run_task") })).toBe(true);
    expect(shouldAutoApproveStaveLocalMcpElicitation({ enabled: true, params: params("stave_respond_user_input") })).toBe(false);
  });

  test("stave_run_task rejects permission options and keeps model and effort", () => {
    expect(McpRunTaskRuntimeOptionsSchema.safeParse({ model: "sonnet", claudeEffort: "high", codexReasoningEffort: "low" }).success).toBe(true);
    for (const widening of [
      { claudePermissionMode: "bypassPermissions" }, { claudeAllowDangerouslySkipPermissions: true },
      { claudeSandboxEnabled: false }, { claudeAllowUnsandboxedCommands: true }, { claudeDisallowedTools: [] },
      { codexApprovalPolicy: "never" }, { codexFileAccess: "danger-full-access" }, { codexNetworkAccess: true },
      { claudeBinaryPath: "/tmp/claude" }, { trustedTools: ["Bash"] },
    ]) {
      expect({ widening, ok: McpRunTaskRuntimeOptionsSchema.safeParse(widening).success }).toEqual({ widening, ok: false });
    }
    expect(omitPermissionRuntimeOptions({ model: "m", claudePermissionMode: "auto", codexApprovalPolicy: "never" })).toEqual({ model: "m" });
  });

  const automation = (overrides: Partial<AutomationUpsertInput> = {}): AutomationUpsertInput => ({
    name: "Nightly", prompt: "Check CI", enabled: true,
    schedule: { kind: "interval", everyMinutes: 60 } as unknown as AutomationUpsertInput["schedule"],
    environment: {} as AutomationUpsertInput["environment"],
    runtime: { provider: "claude-code", model: "sonnet", effort: "low", permissionMode: "default", sandboxEnabled: true, allowUnsandboxedCommands: false, allowDangerouslySkipPermissions: false },
    trustPolicy: "review-required", maxConcurrentRuns: 1, informationReferences: [],
    ...overrides,
  });

  test("a model's automation is saved paused and cannot be unattended or bypass", () => {
    expect(mcpAutomationCreateInput(automation()).enabled).toBe(false);
    expect(() => mcpAutomationCreateInput(automation({ trustPolicy: "unattended" }))).toThrow();
    expect(() => mcpAutomationCreateInput(automation({
      runtime: { ...automation().runtime, permissionMode: "bypassPermissions" } as AutomationUpsertInput["runtime"],
    }))).toThrow();
    expect(() => mcpAutomationCreateInput(automation({
      runtime: { provider: "codex", model: "gpt", effort: "low", fileAccess: "danger-full-access", approvalPolicy: "never", networkAccess: true, webSearch: "disabled" },
    }))).toThrow();
    expect(mcpAutomationUpdateInput(automation(), { enabled: false }).enabled).toBe(false);
    expect(mcpAutomationUpdateInput(automation(), { enabled: true }).enabled).toBe(true);
    expect(() => assertMcpAutomationEnabledChange(true)).toThrow();
    expect(() => assertMcpAutomationEnabledChange(false)).not.toThrow();
  });

  test("stave_respond_approval is not served to MCP clients", async () => {
    const { readFile } = await import("node:fs/promises");
    const server = await readFile("electron/main/stave-mcp-server.ts", "utf8");
    expect(server).not.toContain('"stave_respond_approval",');
    expect(server).toContain('"stave_respond_user_input",');
  });
});

describe("helper autonomy across providers", () => {
  test("an autonomous parent lifts a helper on the other provider; ask, narrowed and read-only helpers stay", async () => {
    const { helperAutonomyPolicy } = await import("../electron/host-service/delegation-policy");
    const { resolveDelegationPermissionPolicy } = await import("../src/lib/runs/delegation-policy");
    const child = resolveDelegationPermissionPolicy({ providerId: "codex", settings: { codexApprovalPolicy: "untrusted" } });
    const autonomousParent = { providerId: "claude-code" as const, options: { claudePermissionMode: "auto" } };
    const askParent = { providerId: "claude-code" as const, options: { claudePermissionMode: "default" } };
    expect(helperAutonomyPolicy("codex", autonomousParent, "inherit", child).options).toMatchObject({
      codexApprovalPolicy: "never", codexFileAccess: "workspace-write", codexNetworkAccess: false,
    });
    expect(helperAutonomyPolicy("codex", askParent, "inherit", child)).toBe(child);
    expect(helperAutonomyPolicy("codex", autonomousParent, "manual", child)).toBe(child);
    const reader = resolveDelegationPermissionPolicy({ providerId: "codex", access: "read-only" });
    expect(helperAutonomyPolicy("codex", autonomousParent, "inherit", reader)).toBe(reader);
  });
  test("a Claude helper of an Agent-mode task inherits its guardrails; a chat task's helper does not", async () => {
    const { resolveDelegationPermissionPolicy, restrictPermissionOptions, normalizedPermissionOptions } = await import("../src/lib/runs/delegation-policy");
    const agentTurn = resolve("claude-code", agent, { claudePermissionMode: "default", claudeGuardrails: ["G1", "G3"] });
    // What the host saves as the parent's effective policy after the Agent turn starts.
    const effective = normalizedPermissionOptions("claude-code", { claudePermissionMode: "default", claudeGuardrails: ["G1", "G3"], ...agentTurn.options });
    const helper = resolveDelegationPermissionPolicy({ providerId: "claude-code", parent: { providerId: "claude-code", options: effective } });
    expect(helper.options).toMatchObject({ claudeAgentTurn: true, claudeGuardrails: ["G1", "G3"] });
    expect(resolve("claude-code", chat, helper.options).guardrails.enabled).toEqual(["G1", "G3"]);
    const narrowed = resolveDelegationPermissionPolicy({ providerId: "claude-code", permissionProfile: "guided", parent: { providerId: "claude-code", options: effective } });
    expect(narrowed.options.claudeAgentTurn).toBe(true);
    const chatParent = normalizedPermissionOptions("claude-code", { claudePermissionMode: "bypassPermissions", ...resolve("claude-code", chat, { claudePermissionMode: "bypassPermissions" }).options });
    const chatHelper = resolveDelegationPermissionPolicy({ providerId: "claude-code", parent: { providerId: "claude-code", options: chatParent } });
    expect(resolve("claude-code", chat, chatHelper.options).guardrails.enabled).toEqual([]);
    // Restriction only adds guardrails and never drops the Agent-mode marker.
    expect(restrictPermissionOptions({ claudeGuardrails: ["G1"] }, { claudeGuardrails: ["G3"], claudeAgentTurn: true }))
      .toMatchObject({ claudeGuardrails: ["G1", "G3"], claudeAgentTurn: true });
    expect(restrictPermissionOptions({ claudeAgentTurn: true }, {}).claudeAgentTurn).toBe(true);
  });

  test("a helper of a Codex Agent runs the guardrails on Claude, and back again", async () => {
    const { helperAutonomyPolicy } = await import("../electron/host-service/delegation-policy");
    const { resolveDelegationPermissionPolicy, normalizedPermissionOptions } = await import("../src/lib/runs/delegation-policy");
    const codexAgent = resolve("codex", agent, { codexApprovalPolicy: "untrusted" });
    const codexParent = { providerId: "codex" as const, options: normalizedPermissionOptions("codex", { codexApprovalPolicy: "untrusted", ...codexAgent.options }) };
    expect(codexParent.options.codexAgentTurn).toBe(true);
    const claudeChild = resolveDelegationPermissionPolicy({ providerId: "claude-code", settings: { claudePermissionMode: "default" } });
    for (const profile of ["inherit", "guided"] as const) {
      const helper = helperAutonomyPolicy("claude-code", codexParent, profile, claudeChild);
      expect(helper.options.claudeAgentTurn).toBe(true);
      expect(resolve("claude-code", chat, helper.options).guardrails.enabled).toEqual(["G1", "G2", "G3"]);
    }
    const chatCodexParent = { providerId: "codex" as const, options: normalizedPermissionOptions("codex", { codexApprovalPolicy: "never" }) };
    expect(helperAutonomyPolicy("claude-code", chatCodexParent, "inherit", claudeChild).options).not.toHaveProperty("claudeAgentTurn");
    const claudeParent = { providerId: "claude-code" as const, options: { claudePermissionMode: "auto", claudeAgentTurn: true } };
    const codexChild = resolveDelegationPermissionPolicy({ providerId: "codex", settings: { codexApprovalPolicy: "untrusted" } });
    expect(helperAutonomyPolicy("codex", claudeParent, "inherit", codexChild).options.codexAgentTurn).toBe(true);
    const reader = resolveDelegationPermissionPolicy({ providerId: "claude-code", access: "read-only" });
    expect(helperAutonomyPolicy("claude-code", codexParent, "inherit", reader)).toBe(reader);
  });
});
