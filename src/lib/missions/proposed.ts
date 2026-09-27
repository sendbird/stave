/**
 * Proposed missions: missions a playbook's start condition — an assigned
 * issue, pull request trouble, a schedule — or a triage mission proposed,
 * waiting in Issues → Proposed for the user to start or dismiss. Nothing here
 * starts work on its own; a playbook that auto-starts records its mission as
 * a started proposal so the same occurrence never starts twice.
 */
import { z } from "zod";
import type { Playbook } from "@/lib/playbooks/schema";
import { MISSION_LIMITS } from "./domain";

export const PROPOSED_MISSION_SOURCES = ["issue", "pull-request", "schedule", "triage"] as const;
export type ProposedMissionSource = (typeof PROPOSED_MISSION_SOURCES)[number];

export const PROPOSED_MISSION_STATES = ["pending", "started", "dismissed"] as const;
export type ProposedMissionState = (typeof PROPOSED_MISSION_STATES)[number];
/** What a list asks for: one state, or "decided" (started or dismissed), newest decision first. */
export const PROPOSAL_LIST_FILTERS = [...PROPOSED_MISSION_STATES, "decided"] as const;
export type ProposalListFilter = (typeof PROPOSAL_LIST_FILTERS)[number];

const IdSchema = z.string().trim().min(1).max(200);

export const ProposedMissionSchema = z
  .object({
    id: IdSchema,
    /** One occurrence of one trigger for one playbook; never proposed twice. */
    sourceKey: z.string().trim().min(1).max(400),
    source: z.enum(PROPOSED_MISSION_SOURCES),
    title: z.string().trim().min(1).max(200),
    /** Why it was proposed, in one line: "Checks failed on PR #612". */
    detail: z.string().trim().max(500).nullable(),
    url: z.string().trim().max(2_048).nullable(),
    playbookId: IdSchema,
    playbookName: z.string().trim().min(1).max(120),
    assignment: z.string().trim().min(1).max(MISSION_LIMITS.maxAssignmentChars),
    /** Where it runs, when the trigger knows: a pull request's workspace, a schedule's. */
    workspaceId: IdSchema.nullable(),
    workspaceName: z.string().trim().max(200).nullable(),
    /** The repository that workspace belongs to, so Start can open it first. */
    repositoryPath: z.string().trim().min(1).max(4_096).nullable().optional(),
    /** The task auto-start created before the mission failed to start; Start reuses it. */
    taskId: IdSchema.nullable().optional(),
    /** The issue it came from, so Start can kick off a workspace for it. */
    issue: z.object({ source: z.string().trim().min(1).max(40), key: z.string().trim().min(1).max(64) }).strict().nullable(),
    /** The triage mission that proposed it. */
    proposedByMissionId: IdSchema.nullable(),
    state: z.enum(PROPOSED_MISSION_STATES),
    missionId: IdSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ProposedMission = z.infer<typeof ProposedMissionSchema>;

/** What `stave_propose_mission` accepts from a triage mission's turn. */
export const ProposeMissionToolInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).describe("A short name for the work, such as the request's gist."),
    assignment: z
      .string()
      .trim()
      .min(1)
      .max(MISSION_LIMITS.maxAssignmentChars)
      .describe("What the mission should achieve, with the source link and the context it needs."),
    url: z.url().max(2_048).optional().describe("The request's link: a Slack thread, an issue, a document."),
    playbookId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("The playbook that fits: a saved playbook id or a template id such as request-to-pr. Default: request-to-pr."),
    key: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("A stable key for this request, so a later triage never proposes it twice. Default: the link."),
  })
  .strict();
export type ProposeMissionToolInput = z.infer<typeof ProposeMissionToolInputSchema>;

export const PROPOSED_SOURCE_LABELS: Record<ProposedMissionSource, string> = {
  issue: "Assigned issue",
  "pull-request": "Pull request",
  schedule: "Schedule",
  triage: "Triage",
};

/** A pull request as a start condition reads it. */
export interface ObservedPullRequest {
  number: number;
  url: string;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  checks: "SUCCESS" | "FAILURE" | "PENDING" | null;
  reviewDecision: string | null;
  headSha: string | null;
}

/** The pull request trouble a playbook's `pullRequest` condition asks for: once per head commit. */
export function pullRequestTroubles(
  playbook: Pick<Playbook, "startsWhen">,
  pr: ObservedPullRequest,
): Array<{ kind: "checks-failed" | "changes-requested"; detail: string }> {
  const wanted = playbook.startsWhen?.pullRequest;
  if (!wanted || pr.state !== "OPEN") return [];
  const troubles: Array<{ kind: "checks-failed" | "changes-requested"; detail: string }> = [];
  if (wanted.checksFailed && pr.checks === "FAILURE") troubles.push({ kind: "checks-failed", detail: `Checks failed on PR #${pr.number}` });
  if (wanted.changesRequested && pr.reviewDecision === "CHANGES_REQUESTED") {
    troubles.push({ kind: "changes-requested", detail: `Changes requested on PR #${pr.number}` });
  }
  return troubles;
}

export const PROPOSAL_IPC = Object.freeze({
  list: "proposals:list",
  dismiss: "proposals:dismiss",
  markStarted: "proposals:mark-started",
  observePullRequest: "proposals:observe-pull-request",
  /** Main → renderer: proposed missions changed. */
  changed: "proposals:changed",
});

export interface ProposalListResponse {
  ok: boolean;
  proposals: ProposedMission[];
  message?: string;
}

export interface ProposalCommandResponse {
  ok: boolean;
  message?: string;
}

export interface ProposalObserveResponse extends ProposalCommandResponse {
  /** The workspace had another mission, so nothing was decided: send it again later. */
  deferred?: boolean;
}

export interface ProposalsBridgeApi {
  list: (args?: { state?: ProposalListFilter; limit?: number }) => Promise<ProposalListResponse>;
  dismiss: (args: { id: string }) => Promise<ProposalCommandResponse>;
  markStarted: (args: { id: string; missionId?: string | null }) => Promise<ProposalCommandResponse>;
  /** The renderer's view of a workspace's pull request, for pull request start conditions. */
  observePullRequest: (args: { workspaceId: string; workspaceName: string; pr: ObservedPullRequest }) => Promise<ProposalObserveResponse>;
  subscribeChanged: (listener: () => void) => () => void;
}
