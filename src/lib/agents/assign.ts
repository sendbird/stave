import { z } from "zod";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { AgentConfigSchema, type AgentConfig } from "./schema";
import { hashAgentContent, type AgentReceivedInstruction, type AgentSupportEntry } from "./compile";

/**
 * Assign: hand one piece of work to an Agent as its main agent.
 *
 * An assignment is the durable record of that hand-off: which request, which
 * agent version, and the workspace and task intake made for it. It owns the
 * start only. Once the task's first turn (or mission) has started, the task,
 * the mission and Fleet own what happens next; the assignment keeps the links.
 *
 * Naming: the entity is `AgentAssignment`; its request text is `assignment`,
 * the same word a mission uses for the same text.
 */

const PROVIDER_IDS = listProviderIds() as [ProviderId, ...ProviderId[]];

export const ASSIGNMENT_LIMITS = {
  requestId: 120,
  assignment: 20_000,
  title: 120,
} as const;

/** What the renderer sends. The agent itself travels with the request: custom agents live in settings. */
export const AssignAgentInputSchema = z
  .object({
    /** Stable per click; repeats of the same request return the same assignment. */
    requestId: z
      .string()
      .trim()
      .min(1)
      .max(ASSIGNMENT_LIMITS.requestId)
      .regex(/^[A-Za-z0-9._:-]+$/),
    agent: AgentConfigSchema,
    assignment: z.string().trim().min(1).max(ASSIGNMENT_LIMITS.assignment),
    /** Provider and model after the renderer applied auto-routing; a fixed agent model wins. */
    providerId: z.enum(PROVIDER_IDS),
    model: z.string().trim().min(1).max(200).nullable().optional(),
    /** Where to work: a repository for a new worktree, or the current workspace. */
    repositoryPath: z.string().trim().min(1).max(4096),
    currentWorkspaceId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type AssignAgentInput = z.infer<typeof AssignAgentInputSchema>;

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
  /** "What it received". */
  received: AgentReceivedInstruction[];
  support: AgentSupportEntry[];
  createdAt: string;
  updatedAt: string;
}

export function hashAssignRequest(input: AssignAgentInput): string {
  return hashAgentContent({
    agent: hashAgentContent(input.agent),
    assignment: input.assignment,
    providerId: input.providerId,
    model: input.model ?? null,
    repositoryPath: input.repositoryPath,
    currentWorkspaceId: input.currentWorkspaceId ?? null,
  });
}

function slug(text: string, max: number) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "work"
  );
}

/** `agent/<agent>-<what>-<id>`: readable in the branch list, unique per assignment. */
export function assignmentBranchName(args: { agentConfigId: string; assignment: string; assignmentId: string }) {
  const suffix = args.assignmentId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return `agent/${slug(args.agentConfigId, 24)}-${slug(args.assignment.split("\n")[0]!, 32)}-${suffix}`;
}

export function assignmentTitle(args: { agentName: string; assignment: string }) {
  const line = args.assignment.split("\n")[0]!.trim();
  const title = `${args.agentName}: ${line}`;
  return title.length > ASSIGNMENT_LIMITS.title ? `${title.slice(0, ASSIGNMENT_LIMITS.title - 1)}…` : title;
}
