import type { AgentInstructionDelivery } from "./turn-provenance";
import { z } from "zod";
import { MY_STANDARDS_MAX_CHARS } from "./standards";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { AgentConfigSchema, type AgentConfig } from "./schema";
import type { AgentReceivedInstruction, AgentSupportEntry } from "./compile";

/**
 * Assign: hand one piece of work to an Agent as its main agent.
 *
 * An assignment is the durable record of that hand-off: which agent version a
 * task runs as, with which standards. Kickoff (or an agent run, or the agentic
 * composer) creates the task and its first turn the ordinary way; the
 * assignment only records who the task runs as, and every later turn reads it.
 *
 * Naming: the entity is `AgentAssignment`; its request text is `assignment`,
 * the same word an agent run uses for the same text.
 */

const PROVIDER_IDS = listProviderIds() as [ProviderId, ...ProviderId[]];

export const ASSIGNMENT_LIMITS = {
  requestId: 120,
  assignment: 20_000,
  title: 120,
} as const;

/**
 * What the renderer sends to record that a task Kickoff created runs as an
 * agent. The workspace and task already exist, so the ids travel with it and
 * the host only writes the assignment row.
 */
export const RecordTaskAgentInputSchema = z
  .object({
    /** Stable per Kickoff create; a retried create records the task once. */
    requestId: z
      .string()
      .trim()
      .min(1)
      .max(ASSIGNMENT_LIMITS.requestId)
      .regex(/^[A-Za-z0-9._:-]+$/),
    taskId: z.string().trim().min(1).max(200),
    workspaceId: z.string().trim().min(1).max(200),
    repositoryPath: z.string().trim().min(1).max(4096),
    agent: AgentConfigSchema,
    role: z.enum(["primary", "delegate"]).optional(),
    assignment: z.string().trim().min(1).max(ASSIGNMENT_LIMITS.assignment),
    /**
     * Provider and model after the renderer applied auto-routing; a fixed agent
     * model wins. A blank model means none (Stave Auto, or the provider's
     * default), so it is recorded as null instead of refusing the choice.
     */
    providerId: z.enum(PROVIDER_IDS),
    model: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z.string().trim().min(1).max(200).nullable().optional(),
    ),
    /** The user's "My standards" at the moment of creating, when turned on. */
    standards: z.string().trim().min(1).max(MY_STANDARDS_MAX_CHARS).optional(),
  })
  .strict();
export type RecordTaskAgentInput = z.infer<typeof RecordTaskAgentInputSchema>;

/**
 * What the renderer sends when the user sets a task back to the default agent
 * in the composer: the task keeps its history, but its later turns run with
 * the task's own settings again.
 */
export const ReleaseTaskAgentInputSchema = z.object({ taskId: z.string().trim().min(1).max(200) }).strict();
export type ReleaseTaskAgentInput = z.infer<typeof ReleaseTaskAgentInputSchema>;

export const ASSIGNMENT_STATES = ["preparing", "started", "failed", "interrupted"] as const;
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

/** UI: Preparing / Started / Couldn't start / Interrupted — check before retrying. */
export const ASSIGNMENT_STATE_LABELS: Readonly<Record<AssignmentState, string>> = {
  preparing: "Preparing",
  started: "Started",
  failed: "Couldn't start",
  interrupted: "Interrupted",
};

export interface AgentAssignment {
  id: string;
  requestId: string;
  /** Hash of the request, so a reused request id with different content is refused. */
  requestHash: string;
  agentConfigId: string;
  agentName: string;
  /** "Version used": the agent exactly as it was at the start, and its hash. */
  agentContentHash: string;
  agent: AgentConfig;
  /** Older assignments are primary; delegated snapshots never use the primary compiler. */
  role?: "primary" | "delegate";
  assignment: string;
  providerId: ProviderId;
  model: string | null;
  repositoryPath: string;
  workspaceMode: "new-worktree" | "same-workspace";
  branch: string | null;
  workspaceId: string | null;
  taskId: string | null;
  turnId: string | null;
  state: AssignmentState;
  detail: string | null;
  /** The user's standards the task started with; later turns keep them. */
  standards?: string | null;
  /** Sessions that received this assignment version; missing history is never inferred. */
  instructionDeliveries?: AgentInstructionDelivery[];
  /** Set when the user moved the task off this agent; later turns no longer run as it. */
  endedAt?: string | null;
  /** "What it received". */
  received: AgentReceivedInstruction[];
  support: AgentSupportEntry[];
  createdAt: string;
  updatedAt: string;
}
