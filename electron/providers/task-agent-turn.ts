import type { AgentAssignment } from "../../src/lib/agents/assign";
import { compileTaskAgentRole, compiledTaskAgentRuntimeOptions } from "../../src/lib/agents/runtime-options";
import { agentPermissionOverrides } from "../../src/lib/agents/permission";
import { AgentTurnProvenanceSchema, type AgentInstructionDelivery, type AgentTurnProvenance } from "../../src/lib/agents/turn-provenance";
import type { BridgeEvent, StreamTurnArgs } from "./types";

/** One saved assignment owns the policy and evidence for this task turn. */
export interface TaskAgentTurn {
  runtimeOptions: NonNullable<StreamTurnArgs["runtimeOptions"]>;
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
  // Delegation policy has already been resolved by its host authority. Its Agent
  // snapshot supplies instructions, without applying a primary permission cap.
  const runtimeOptions = { ...base, ...(compiled.role === "primary"
    ? compiledTaskAgentRuntimeOptions(compiled, turn.providerId, base)
    : { agentInstructions: compiled.promptPreamble }) };
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
      source: compiled.role === "delegate" ? "delegation-policy" : Object.keys(agentPermissionOverrides({
        permission: compiled.permission, providerId: turn.providerId, options: base,
      })).length ? "agent-ceiling" : "user-settings",
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
