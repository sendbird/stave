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
  providerId: z.enum(["claude-code", "codex", "cursor", "kiro"]),
  model: z.string().max(200).nullable(),
  effort: z.string().max(80).nullable(),
  permission: z.object({
    source: z.enum(["user-settings", "agent-ceiling", "delegation-policy"]),
    agentLimit: z.enum(["auto", "guided", "manual", "read-only"]),
    support: z.enum(["enforced", "instructed"]),
    applied: z.object({
      claudePermissionMode: z.string().max(80).optional(),
      claudeAllowDangerouslySkipPermissions: z.boolean().optional(),
      claudeDisallowedTools: z.array(z.string().max(80)).max(128).optional(),
      codexFileAccess: z.string().max(80).optional(),
      codexApprovalPolicy: z.string().max(80).optional(),
      codexNetworkAccess: z.boolean().optional(),
      cursorMode: z.string().max(80).optional(),
      cursorApprovalMode: z.string().max(80).optional(),
      kiroApprovalMode: z.string().max(80).optional(),
    }).strict(),
  }).strict(),
  instructions: z.object({
    channel: z.enum(["instruction", "prompt"]),
    status: z.enum(["configured", "delivered", "retained-session"]),
    nativeSessionId: z.string().min(1).max(500).optional(),
  }).strict(),
}).strict();

export type AgentTurnProvenance = z.infer<typeof AgentTurnProvenanceSchema>;

export interface AgentInstructionDelivery {
  providerId: AgentTurnProvenance["providerId"];
  nativeSessionId: string;
  agentContentHash: string;
}
