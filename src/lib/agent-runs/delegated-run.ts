import { z } from "zod";
import { DelegationPermissionPolicySchema } from "../runs/delegation-policy";
import { buildAgentRunWorkflow } from "./agent-run";
import { AGENT_RUN_LIMITS, type AgentRunStartInput } from "./domain";
import type { AgentConfig } from "../agents/schema";
import type { AgentRunDetail } from "./api";
import type { ProviderRuntimeOptions } from "../providers/provider.types";
export type DelegatedAgentRunDetail = AgentRunDetail & { delegationActivated?: boolean };
export type DelegatedAgentRunRead = DelegatedAgentRunDetail | { missing: true };

/** Preserve transport/session choices, never caller authority or secret bindings. */
export function delegatedReplyRuntimeOptions(caller: ProviderRuntimeOptions | undefined, admitted: ProviderRuntimeOptions): ProviderRuntimeOptions {
  const { claudeBinaryPath, codexBinaryPath, claudeAccountProfileId, codexAccountProfileId,
    providerTimeoutMs, debug, chatStreamingEnabled, claudeResumeSessionId, claudeResumeSessionAt, codexResumeThreadId } = caller ?? {};
  return { claudeBinaryPath, codexBinaryPath, claudeAccountProfileId, codexAccountProfileId,
    providerTimeoutMs, debug, chatStreamingEnabled, claudeResumeSessionId, claudeResumeSessionAt, codexResumeThreadId, ...admitted };
}

// Internal main -> host authority. Public AgentRun start schemas do not accept it.
export const DelegatedAgentRunAuthoritySchema = z.object({
  modelPinned: z.boolean().optional(),
  effortPinned: z.boolean().optional(),
  resourceRootRunId: z.string().trim().min(1).max(256).optional(),
  parentTaskId: z.string().trim().min(1).max(150),
  executionId: z.string().trim().min(1).max(256),
  agentConfigId: z.string().trim().min(1).max(80),
  agentContentHash: z.string().trim().min(1).max(80),
  permissionPolicy: DelegationPermissionPolicySchema,
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
}).strict();
export type DelegatedAgentRunAuthority = z.infer<typeof DelegatedAgentRunAuthoritySchema>;

export const DelegatedAgentRunStartSchema = z.object({
  agentRunId: z.string().trim().min(1).max(256),
  workspaceId: z.string().trim().min(1).max(256),
  taskId: z.string().trim().min(1).max(150),
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(AGENT_RUN_LIMITS.maxAssignmentChars),
  model: z.string().trim().min(1).max(200),
  maxTurns: z.number().int().min(1).max(AGENT_RUN_LIMITS.defaultMaxTurns),
  authority: DelegatedAgentRunAuthoritySchema,
}).strict();
export type DelegatedAgentRunStart = z.infer<typeof DelegatedAgentRunStartSchema>;

/** A child keeps its frozen workflow but never inherits primary effect consent. */
export function buildDelegatedAgentRunInput(args: {
  start: DelegatedAgentRunStart; agent: AgentConfig; now: Date;
}): AgentRunStartInput {
  const workflow = buildAgentRunWorkflow({ agent: args.agent, now: args.now });
  return {
    workspaceId: args.start.workspaceId, leadTaskId: args.start.taskId,
    assignment: args.start.prompt, workflow: { ...workflow, team: "solo" },
    consent: { checkIns: workflow.checkIns, permissionMode: "manual", authorizedEffectStageIds: [] },
    maxTurns: args.start.maxTurns, origin: "agent",
  };
}
