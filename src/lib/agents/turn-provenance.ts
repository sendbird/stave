import { z } from "zod";

/** Recorded configuration for one turn; native model evidence stays in modelExecution. */
export const AgentTurnProvenanceSchema = z.object({
  version: z.literal(1),
  turnId: z.string().min(1).max(200),
  assignmentId: z.string().min(1).max(200),
  agentConfigId: z.string().min(1).max(80),
  agentName: z.string().min(1).max(80),
  agentContentHash: z.string().min(1).max(200),
  role: z.enum(["primary", "delegate"]),
  providerId: z.enum(["claude-code", "codex", "cursor", "kiro", "opencode"]),
  model: z.string().max(200).nullable(),
  effort: z.string().max(80).nullable(),
  permission: z.object({
    // `agent-ceiling` is kept so turns recorded before agent autonomy still parse.
    source: z.enum(["user-settings", "agent-ceiling", "agent-autonomy", "delegation-policy"]),
    agentLimit: z.enum(["auto", "guided", "manual", "read-only"]),
    support: z.enum(["enforced", "instructed"]),
    applied: z.object({
      claudePermissionMode: z.string().max(80).optional(),
      claudeAllowDangerouslySkipPermissions: z.boolean().optional(),
      claudeDisallowedTools: z.array(z.string().max(80)).max(128).optional(),
      codexFileAccess: z.string().max(80).optional(),
      codexApprovalPolicy: z.string().max(80).optional(),
      codexApprovalsReviewer: z.enum(["user", "auto_review"]).optional(),
      codexNetworkAccess: z.boolean().optional(),
      cursorMode: z.string().max(80).optional(),
      cursorApprovalMode: z.string().max(80).optional(),
      kiroApprovalMode: z.string().max(80).optional(),
      opencodeApprovalMode: z.string().max(80).optional(),
      opencodeDenyEdits: z.boolean().optional(),
    }).strict(),
    /**
     * Set once the runtime confirmed, after the turn started, the approvals in
     * `applied` (Codex `approvals_applied`). Absent, they are only what the
     * turn asked for: before its start, for a turn that never started, and on
     * turns recorded before runtimes confirmed them.
     */
    approvalsConfirmed: z.literal(true).optional(),
  }).strict(),
  instructions: z.object({
    channel: z.enum(["instruction", "prompt"]),
    status: z.enum(["configured", "delivered", "retained-session"]),
    nativeSessionId: z.string().min(1).max(500).optional(),
  }).strict(),
}).strict();

export type AgentTurnProvenance = z.infer<typeof AgentTurnProvenanceSchema>;

/** The approvals a runtime confirmed a turn started with. */
export interface ConfirmedTurnApprovals {
  codexApprovalPolicy: string;
  codexApprovalsReviewer?: "user" | "auto_review";
}

/**
 * The provenance with the approvals its runtime confirmed, in place of the
 * requested ones. The rest of the recorded configuration never changes.
 */
export function withConfirmedApprovals(provenance: AgentTurnProvenance, approvals: ConfirmedTurnApprovals): AgentTurnProvenance {
  const { codexApprovalPolicy: _policy, codexApprovalsReviewer: _reviewer, ...applied } = provenance.permission.applied;
  return {
    ...provenance,
    permission: {
      ...provenance.permission,
      applied: {
        ...applied,
        codexApprovalPolicy: approvals.codexApprovalPolicy,
        ...(approvals.codexApprovalsReviewer ? { codexApprovalsReviewer: approvals.codexApprovalsReviewer } : {}),
      },
      approvalsConfirmed: true,
    },
  };
}

export interface AgentInstructionDelivery {
  providerId: AgentTurnProvenance["providerId"];
  nativeSessionId: string;
  agentContentHash: string;
}
