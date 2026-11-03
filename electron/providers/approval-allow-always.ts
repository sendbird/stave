import type { ApprovalRisk } from "../../src/lib/approvals/approval-resolution";
import { buildTrustedToolEntryForApproval } from "../../src/lib/providers/trusted-tools";
import type { ClaudeGuardrailHit } from "./claude-guardrail-hook";
import { isNeverAutoApprovedStaveLocalMcpTool } from "./stave-local-mcp-approval";

/**
 * What an `approval` event says about "Always allow": nothing (the control is
 * not offered), or that it is honored on later calls — through the provider's
 * own rule store, or through an entry in Stave's trusted tools.
 */
export type ApprovalAllowAlwaysFields =
  | Record<string, never>
  | { supportsAllowAlways: true; trustedToolEntry?: string };

const NONE: ApprovalAllowAlwaysFields = {};

/**
 * "Always allow" kept as a Stave trusted-tools entry. Offered when an entry
 * can name the call (a tool, or Bash with its command) and a trusted entry is
 * allowed to answer it: Stave tools that answer another task's prompt always
 * reach the user, so no rule may answer them.
 *
 * The renderer answers a later matching request from the user's current list
 * for every provider, and Claude also passes the list to its runtime, so the
 * entry is what "Always allow" keeps and "Remove" takes away.
 */
export function resolveTrustedRuleAllowAlways(args: {
  toolName: string;
  /** The value later requests are matched against (Bash: the command). */
  input?: string;
}): ApprovalAllowAlwaysFields {
  if (isNeverAutoApprovedStaveLocalMcpTool(args.toolName)) {
    return NONE;
  }
  const entry = buildTrustedToolEntryForApproval({
    toolName: args.toolName,
    input: args.input,
  });
  return entry ? { supportsAllowAlways: true, trustedToolEntry: entry } : NONE;
}

/**
 * Claude: a call that crossed a Stave guardrail (G1–G3) always reaches the
 * user, so a trusted entry could never answer it again and the control is not
 * offered. Otherwise the call's tool, or its Bash command, becomes the entry.
 */
export function resolveClaudeApprovalAllowAlways(args: {
  toolName: string;
  /** `resolveTrustedApprovalInput`: the Bash command, or nothing. */
  trustedApprovalInput?: string;
  guardrail: ClaudeGuardrailHit | null;
}): ApprovalAllowAlwaysFields {
  if (args.guardrail) {
    return NONE;
  }
  return resolveTrustedRuleAllowAlways({
    toolName: args.toolName,
    input: args.trustedApprovalInput,
  });
}

const CLAUDE_GUARDRAIL_RISKS: Readonly<Record<ClaudeGuardrailHit["id"], ApprovalRisk>> = {
  G1: "write-outside-repository",
  G2: "credential-access",
  G3: "irreversible-remote",
};

/** Claude: the risk is the guardrail the call crossed, and only that. */
export function resolveClaudeApprovalRisk(
  guardrail: ClaudeGuardrailHit | null,
): ApprovalRisk | undefined {
  return guardrail ? CLAUDE_GUARDRAIL_RISKS[guardrail.id] : undefined;
}

/**
 * Codex: a command (by its exact command line) and a patch inside the
 * workspace. Codex's own grants (`acceptForSession`, exec-policy amendments)
 * are not used: Stave could not show or remove them, so "Always allow" would
 * become a rule nobody can see. Not offered for:
 *
 * - input sent to a running terminal (`writeStdin`): it names no command
 * - a patch asking for a write root beyond the workspace (`grantRoot`)
 * - a request for extra permissions: each one asks for a different set
 * - an MCP elicitation: its tool name is inferred, not reported
 */
export function resolveCodexApprovalAllowAlways(args: {
  method: string;
  params: Record<string, unknown>;
  toolName: string;
  input?: string;
}): ApprovalAllowAlwaysFields {
  switch (args.method) {
    case "item/commandExecution/requestApproval":
      if (args.params.kind === "writeStdin") return NONE;
      return resolveTrustedRuleAllowAlways({ toolName: args.toolName, input: args.input });
    case "execCommandApproval":
      return resolveTrustedRuleAllowAlways({ toolName: args.toolName, input: args.input });
    case "item/fileChange/requestApproval":
    case "applyPatchApproval": {
      const grantRoot = typeof args.params.grantRoot === "string" ? args.params.grantRoot.trim() : "";
      if (grantRoot) return NONE;
      return resolveTrustedRuleAllowAlways({ toolName: args.toolName });
    }
    default:
      return NONE;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPaths(value: unknown) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}

/**
 * Codex: what the request itself reports. A command held for a managed-network
 * approval needs network access; a permissions request asks for network
 * access, or for file-system access beyond the sandbox.
 */
export function resolveCodexApprovalRisk(args: {
  method: string;
  params: Record<string, unknown>;
}): ApprovalRisk | undefined {
  // A patch that asks for a write root beyond the workspace is a write outside
  // the repository, whatever trusted entry names its tool.
  if (
    (args.method === "item/fileChange/requestApproval" || args.method === "applyPatchApproval") &&
    typeof args.params.grantRoot === "string" && args.params.grantRoot.trim()
  ) {
    return "write-outside-repository";
  }
  if (args.method === "item/commandExecution/requestApproval") {
    return isRecord(args.params.networkApprovalContext) ? "network-access" : undefined;
  }
  if (args.method === "item/permissions/requestApproval" && isRecord(args.params.permissions)) {
    const { network, fileSystem } = args.params.permissions;
    if (isRecord(network) && network.enabled === true) return "network-access";
    if (isRecord(fileSystem) && (hasPaths(fileSystem.read) || hasPaths(fileSystem.write) ||
      (Array.isArray(fileSystem.entries) && fileSystem.entries.length > 0))) {
      return "file-system-access";
    }
  }
  return undefined;
}

/**
 * ACP: the agent's own `allow_always` option when it advertises one (the agent
 * keeps the rule); otherwise a Stave trusted entry, as for every provider.
 */
export function resolveAcpApprovalAllowAlways(args: {
  nativeAllowAlways: boolean;
  toolName: string;
  input?: string;
}): ApprovalAllowAlwaysFields {
  if (isNeverAutoApprovedStaveLocalMcpTool(args.toolName)) {
    return NONE;
  }
  if (args.nativeAllowAlways) {
    return { supportsAllowAlways: true };
  }
  return resolveTrustedRuleAllowAlways({ toolName: args.toolName, input: args.input });
}

/** The always-allow fields and the risk word of a Claude approval, as one spread for its event. */
export function resolveClaudeApprovalExtras(args: Parameters<typeof resolveClaudeApprovalAllowAlways>[0]) {
  const risk = resolveClaudeApprovalRisk(args.guardrail);
  return { ...resolveClaudeApprovalAllowAlways(args), ...(risk ? { risk } : {}) };
}

/** The always-allow fields and the risk word of a Codex approval, as one spread for its event. */
export function resolveCodexApprovalExtras(args: Parameters<typeof resolveCodexApprovalAllowAlways>[0]) {
  const risk = resolveCodexApprovalRisk(args);
  return { ...resolveCodexApprovalAllowAlways(args), ...(risk ? { risk } : {}) };
}
