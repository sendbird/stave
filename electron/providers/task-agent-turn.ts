import type { AgentAssignment } from "../../src/lib/agents/assign";
import { agentRuntimeOptions, compileTaskAgentRole } from "../../src/lib/agents/runtime-options";
import { compileNativeSubagents } from "../../src/lib/agents/native-subagents";
import type { AgentConfig } from "../../src/lib/agents/schema";
import { resolveTurnPolicy, type TurnPolicy } from "../../src/lib/policy/turn-policy";
import { AgentTurnProvenanceSchema, type AgentInstructionDelivery, type AgentTurnProvenance } from "../../src/lib/agents/turn-provenance";
import type { BridgeEvent, StreamTurnArgs } from "./types";

/** One saved assignment owns the policy and evidence for this task turn. */
export interface TaskAgentTurn {
  runtimeOptions: NonNullable<StreamTurnArgs["runtimeOptions"]>;
  /** A main Agent's resolved autonomy; absent for a delegate, whose delegation already resolved it. */
  turnPolicy?: TurnPolicy;
  provenance: AgentTurnProvenance;
  observe: (event: BridgeEvent) => BridgeEvent | null;
  prepareSessionPrompt: (sessionId: string, resumed: boolean) => string | null;
  acknowledgeSessionPrompt: () => BridgeEvent | null;
}

export function prepareTaskAgentTurn(args: {
  turn: StreamTurnArgs;
  assignment: AgentAssignment;
  hasDelivery: (delivery: AgentInstructionDelivery) => boolean;
  recordDelivery: (delivery: AgentInstructionDelivery) => void;
  /** The agents a main Agent may call as in-turn subagents. */
  library?: readonly AgentConfig[];
}): TaskAgentTurn {
  const { turn, assignment } = args;
  const compiled = compileTaskAgentRole({
    agent: assignment.agent, providerId: turn.providerId, standards: assignment.standards,
    role: assignment.role ?? "primary",
  });
  if (compiled.contentHash !== assignment.agentContentHash ||
      compiled.agentConfigId !== assignment.agentConfigId || assignment.agent.name !== assignment.agentName) {
    throw new Error("The task's saved Agent identity is inconsistent.");
  }
  const base = turn.runtimeOptions ?? {};
  // A main Agent runs autonomously unless it is read only (`turn-policy.ts`);
  // its saved permission is no longer a ceiling. Delegation policy has already
  // been resolved by its host authority, so a delegate only adds instructions.
  const instructions = compiled.role === "primary" ? agentRuntimeOptions(compiled, base) : {};
  const turnPolicy = compiled.role === "primary" ? resolveTurnPolicy({
    providerId: turn.providerId, options: { ...base, ...instructions }, root: turn.cwd ?? "",
    actor: { kind: "agent", access: compiled.permission === "read-only" ? "read-only" : "full" },
  }) : undefined;
  // Only a main Agent calls in-turn subagents; a subagent runs one level deep.
  const nativeSubagents = compiled.role === "primary" && (turn.providerId === "claude-code" || turn.providerId === "codex")
    ? compileNativeSubagents({
        lead: assignment.agent, library: args.library ?? [], providerId: turn.providerId, standards: assignment.standards,
      })
    : [];
  const { nativeSubagents: _requested, ...baseWithoutSubagents } = base;
  const runtimeOptions = { ...baseWithoutSubagents, ...(compiled.role === "primary"
    ? { ...instructions, ...turnPolicy?.options }
    : { agentInstructions: compiled.promptPreamble }),
    ...(nativeSubagents.length > 0 ? { nativeSubagents } : {}) };
  const promptPreamble = compiled.role === "primary" ? compiled.promptPreamble : undefined;
  const applied: AgentTurnProvenance["permission"]["applied"] = {};
  const providerKeys = {
    "claude-code": ["claudePermissionMode", "claudeAllowDangerouslySkipPermissions", "claudeDisallowedTools"],
    codex: ["codexFileAccess", "codexApprovalPolicy", "codexNetworkAccess"],
    cursor: ["cursorMode", "cursorApprovalMode"],
    kiro: ["kiroApprovalMode"],
  } as const;
  const keys = providerKeys[turn.providerId];
  for (const key of keys) {
    const value = runtimeOptions[key];
    if (value !== undefined) Object.assign(applied, { [key]: value });
  }
  let provenance = AgentTurnProvenanceSchema.parse({
    version: 1, turnId: turn.turnId, assignmentId: assignment.id,
    agentConfigId: assignment.agentConfigId, agentName: assignment.agentName,
    agentContentHash: assignment.agentContentHash, providerId: turn.providerId,
    role: compiled.role,
    model: runtimeOptions.model ?? null,
    effort: ({ "claude-code": runtimeOptions.claudeEffort, codex: runtimeOptions.codexReasoningEffort,
      cursor: runtimeOptions.cursorEffort, kiro: runtimeOptions.kiroEffort })[turn.providerId] ?? null,
    permission: {
      source: compiled.role === "delegate" ? "delegation-policy" : "agent-autonomy",
      agentLimit: compiled.permission,
      support: (compiled.role === "delegate" && compiled.permission === "read-only") ||
        compiled.support.find((entry) => entry.field === "permission")?.level === "instructed"
        ? "instructed" : "enforced",
      applied,
    },
    instructions: { channel: promptPreamble ? "prompt" : "instruction", status: "configured" },
  });
  let sessionId: string | undefined;
  let promptNeedsDelivery = false;
  const update = (status: AgentTurnProvenance["instructions"]["status"]): BridgeEvent => {
    provenance = { ...provenance, instructions: {
      ...provenance.instructions, status, ...(sessionId ? { nativeSessionId: sessionId } : {}),
    } };
    return { type: "agent_provenance", provenance };
  };
  const delivery = (): AgentInstructionDelivery => ({
    providerId: turn.providerId, nativeSessionId: sessionId!, agentContentHash: assignment.agentContentHash,
  });
  return {
    runtimeOptions,
    ...(turnPolicy ? { turnPolicy } : {}),
    provenance,
    observe(event) {
      if (event.type === "provider_session") sessionId = event.nativeSessionId;
      if (!promptPreamble && provenance.instructions.status === "configured" &&
          ((event.type === "text" && event.text.trim()) || event.type === "tool" ||
            event.type === "tool_result" || event.type === "approval" || event.type === "user_input" || event.type === "plan_ready")) {
        return update("delivered");
      }
      return null;
    },
    prepareSessionPrompt(actualSessionId, resumed) {
      sessionId = actualSessionId;
      if (!promptPreamble) return null;
      promptNeedsDelivery = !resumed || !args.hasDelivery(delivery());
      return promptNeedsDelivery ? promptPreamble : null;
    },
    acknowledgeSessionPrompt() {
      if (!promptPreamble || !sessionId) return null;
      if (promptNeedsDelivery) args.recordDelivery(delivery());
      return update(promptNeedsDelivery ? "delivered" : "retained-session");
    },
  };
}
