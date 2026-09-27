import { randomUUID } from "node:crypto";

import { extractJiraIssueUrlReference } from "../../../src/lib/crane-connector/jira-reference";
import { proposeDispatchWorkspaceLabel } from "../../../src/lib/crane-connector/workspace-label";
import type {
  CraneDispatchRuntimeChoice,
  CraneDispatchWorkspaceChoice,
} from "../../../src/lib/crane-connector/types";
import type { CraneStaveJobV1 } from "../../../src/lib/crane-connector/contract";
import type {
  CanonicalRetrievedContextPart,
  ProviderRuntimeOptions,
} from "../../../src/lib/providers/provider.types";
import {
  buildTrackerIssueInstruction,
  buildTrackerIssuePrompt,
  buildTrackerIssueRetrievedContext,
  buildTrackerIssueTitle,
} from "../../../src/lib/tracker-issues/context";
import type { TrackerSourceAdapter } from "../../../src/lib/tracker-issues/source";
import type {
  TrackerSourceId,
  TrackerIssue,
  TrackerIssueDetail,
  TrackerIssueKickoffArgs,
  TrackerIssueKickoffResult,
  TrackerIssueLinkState,
  TrackerIssueStaveLink,
} from "../../../src/lib/tracker-issues/types";
import type { CraneTaskJobClaimResponse } from "../atelier-connector/http-client";
import { runtimeOptionsForApproval } from "../crane-connector/runtime";
import { TrackerIssueError } from "./errors";
import type { TrackerIssuesPersistence } from "./persistence";

/**
 * Everything kickoff needs from the main process, injected so the whole flow —
 * claim, workspace create, run start, and the kickoff-row write — can be
 * exercised against fakes without an Electron runtime. No credential, lease, or
 * secret crosses this boundary: the Crane claim is opened behind
 * `createCraneTaskJob` and the run is started behind `runLocallyApprovedRun`.
 */
export interface TrackerIssueKickoffDependencies {
  persistence: Pick<
    TrackerIssuesPersistence,
    "getTrackerIssue" | "upsertTrackerIssueKickoff"
  >;
  getAdapter(source: TrackerSourceId): TrackerSourceAdapter;
  /** Enabled, paired, and holding the `crane` scope. Gate for write-back. */
  craneWriteBackAvailable(): boolean | Promise<boolean>;
  createCraneTaskJob(args: {
    taskRef: string;
    instruction: string;
    signal?: AbortSignal;
  }): Promise<CraneTaskJobClaimResponse>;
  kickoffClaimedJob(args: {
    claimed: {
      job: CraneStaveJobV1;
      leaseId: string;
      leaseExpiresAt: string;
      nextSequence: number;
    };
    repositoryPath: string;
    workspace: CraneDispatchWorkspaceChoice;
    runtime: CraneDispatchRuntimeChoice;
  }): Promise<{ jobId: string; workspaceId: string; taskId: string }>;
  listKnownRepositories(): Promise<
    Array<{
      repositoryPath: string;
      defaultBranch: string;
      workspaces: Array<{ id: string }>;
    }>
  >;
  createWorkspace(args: {
    repositoryPath: string;
    name: string;
    label?: string;
    mode: "branch";
    fromBranch?: string;
    fromBranchKind?: "local" | "remote";
  }): Promise<{ workspaceId: string }>;
  runLocallyApprovedRun(args: {
    workspaceId: string;
    prompt: string;
    title: string;
    provider: "claude-code" | "codex";
    runtimeOptions: ProviderRuntimeOptions;
    retrievedContextParts: CanonicalRetrievedContextPart[];
  }): Promise<{ workspaceId: string; taskId: string }>;
  /**
   * Files the ticket into the workspace Information panel. Best-effort: a panel
   * failure must never abort a run that is otherwise ready.
   */
  registerWorkspaceIssues(args: {
    workspaceId: string;
    crane: { url: string; issueKey: string; title: string } | null;
    jira: { url: string; issueKey: string } | null;
  }): Promise<void>;
  now?: () => Date;
  generateId?: () => string;
}

const JIRA_LINK_REL = "jira";

/** Pull the declared Jira link off a ticket for Information-panel registration. */
function jiraLinkFromTask(
  task: TrackerIssue,
): { url: string; issueKey: string } | null {
  for (const link of task.links) {
    if (link.rel.trim().toLowerCase() !== JIRA_LINK_REL) {
      continue;
    }
    const key =
      link.key?.trim().toUpperCase() ??
      extractJiraIssueUrlReference(link.url)?.key;
    if (key) {
      return { url: link.url, issueKey: key };
    }
  }
  return null;
}

export async function kickoffTrackerIssue(
  deps: TrackerIssueKickoffDependencies,
  args: TrackerIssueKickoffArgs,
): Promise<TrackerIssueKickoffResult> {
  const now = () => (deps.now ?? (() => new Date()))();
  const nowIso = () => now().toISOString();
  const newId = () => (deps.generateId ?? randomUUID)();

  const adapter = deps.getAdapter(args.source);
  // The instruction and retrieved context both need the body, so the detail is
  // fetched every time even when a summary is already cached.
  const detail = await adapter.getTask({
    ref: args.taskRef,
    signal: new AbortController().signal,
  });
  const cached = deps.persistence.getTrackerIssue(args.source, args.taskRef);
  const task: TrackerIssue = cached ?? detail;

  const persistKickoff = (fields: {
    workspaceId: string;
    staveTaskId: string | null;
    craneJobId: string | null;
    state: TrackerIssueLinkState;
  }): string => {
    const stamp = nowIso();
    const link: TrackerIssueStaveLink = {
      id: newId(),
      source: args.source,
      taskRef: args.taskRef,
      taskKey: task.key,
      workspaceId: fields.workspaceId,
      staveTaskId: fields.staveTaskId,
      craneJobId: fields.craneJobId,
      state: fields.state,
      errorCode: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    deps.persistence.upsertTrackerIssueKickoff(link);
    return link.id;
  };

  // Crane write-back: open an already-claimed job and let the connector runtime
  // launch it exactly as a locally approved dispatch would.
  if (args.craneWriteBack) {
    if (!(await deps.craneWriteBackAvailable())) {
      throw new TrackerIssueError("crane_connector_disabled");
    }
    let claimed: CraneTaskJobClaimResponse;
    try {
      claimed = await deps.createCraneTaskJob({
        taskRef: args.taskRef,
        instruction: args.instruction,
      });
    } catch {
      throw new TrackerIssueError("crane_claim_failed");
    }
    await assertRepositoryRegistered(deps, args.repositoryPath);
    let launched: { jobId: string; workspaceId: string; taskId: string };
    try {
      launched = await deps.kickoffClaimedJob({
        claimed,
        repositoryPath: args.repositoryPath,
        workspace: args.workspace,
        runtime: args.runtime,
      });
    } catch {
      throw new TrackerIssueError("crane_kickoff_failed");
    }
    const kickoffId = persistKickoff({
      workspaceId: launched.workspaceId,
      staveTaskId: launched.taskId,
      craneJobId: launched.jobId,
      state: "running",
    });
    return {
      kickoffId,
      workspaceId: launched.workspaceId,
      taskId: launched.taskId,
      craneJobId: launched.jobId,
      staged: null,
    };
  }

  // Jira, or Crane without write-back: the run is tracked in Stave alone.
  const repository = await assertRepositoryRegistered(deps, args.repositoryPath);
  const workspaceId = await resolveWorkspaceId(
    deps,
    repository,
    args.workspace,
    task.title,
  );

  await registerIssues(deps, workspaceId, args.source, task);

  if (args.startMode === "stage") {
    // Staging is a composer draft the renderer owns, so no task is created and
    // the built instruction is handed back for it to prefill.
    const kickoffId = persistKickoff({
      workspaceId,
      staveTaskId: null,
      craneJobId: null,
      state: "staged",
    });
    return {
      kickoffId,
      workspaceId,
      taskId: null,
      craneJobId: null,
      staged: {
        title: buildTrackerIssueTitle(task),
        prompt: buildTrackerIssueInstruction(task, detail),
      },
    };
  }

  const retrievedContext = buildTrackerIssueRetrievedContext({
    detail,
    instruction: args.instruction,
  });
  let run: { workspaceId: string; taskId: string };
  try {
    run = await deps.runLocallyApprovedRun({
      workspaceId,
      prompt: buildTrackerIssuePrompt(task),
      title: buildTrackerIssueTitle(task),
      provider: args.runtime.provider,
      runtimeOptions: runtimeOptionsForApproval({ runtime: args.runtime }),
      retrievedContextParts: [retrievedContext],
    });
  } catch {
    throw new TrackerIssueError("provider_start_failed");
  }
  const kickoffId = persistKickoff({
    workspaceId: run.workspaceId,
    staveTaskId: run.taskId,
    craneJobId: null,
    state: "running",
  });
  return {
    kickoffId,
    workspaceId: run.workspaceId,
    taskId: run.taskId,
    craneJobId: null,
    staged: null,
  };
}

async function assertRepositoryRegistered(
  deps: TrackerIssueKickoffDependencies,
  repositoryPath: string,
): Promise<{
  repositoryPath: string;
  defaultBranch: string;
  workspaces: Array<{ id: string }>;
}> {
  const repositories = await deps.listKnownRepositories();
  const repository = repositories.find(
    (candidate) => candidate.repositoryPath === repositoryPath,
  );
  if (!repository) {
    throw new TrackerIssueError("project_not_registered");
  }
  return repository;
}

async function resolveWorkspaceId(
  deps: TrackerIssueKickoffDependencies,
  repository: {
    repositoryPath: string;
    defaultBranch: string;
    workspaces: Array<{ id: string }>;
  },
  workspace: CraneDispatchWorkspaceChoice,
  issueTitle: string,
): Promise<string> {
  if (workspace.strategy === "existing") {
    const existing = repository.workspaces.find(
      (candidate) => candidate.id === workspace.workspaceId,
    );
    if (!existing) {
      throw new TrackerIssueError("workspace_not_found");
    }
    return existing.id;
  }
  try {
    const created = await deps.createWorkspace({
      repositoryPath: repository.repositoryPath,
      name: workspace.branchName,
      label:
        workspace.workspaceLabel?.trim() ||
        proposeDispatchWorkspaceLabel(issueTitle) ||
        undefined,
      mode: "branch",
      fromBranch: repository.defaultBranch,
      fromBranchKind: "remote",
    });
    return created.workspaceId;
  } catch {
    throw new TrackerIssueError("workspace_create_failed");
  }
}

async function registerIssues(
  deps: TrackerIssueKickoffDependencies,
  workspaceId: string,
  source: TrackerSourceId,
  task: TrackerIssue,
): Promise<void> {
  const crane =
    source === "crane"
      ? { url: task.url, issueKey: task.key, title: task.title }
      : null;
  // A Crane ticket carrying a `rel: "jira"` link is filed in both sections;
  // a Jira ticket only in the Jira section.
  const jira =
    source === "jira"
      ? { url: task.url, issueKey: task.key }
      : jiraLinkFromTask(task);
  try {
    await deps.registerWorkspaceIssues({ workspaceId, crane, jira });
  } catch {
    // Panel bookkeeping must never block the kickoff.
  }
}
