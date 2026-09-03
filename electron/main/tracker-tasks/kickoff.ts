import { randomUUID } from "node:crypto";

import { extractJiraIssueUrlReference } from "../../../src/lib/crane-connector/jira-reference";
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
  buildTrackerTaskInstruction,
  buildTrackerTaskPrompt,
  buildTrackerTaskRetrievedContext,
  buildTrackerTaskTitle,
} from "../../../src/lib/tracker-tasks/context";
import type { TrackerSourceAdapter } from "../../../src/lib/tracker-tasks/source";
import type {
  TrackerSourceId,
  TrackerTask,
  TrackerTaskDetail,
  TrackerTaskKickoffArgs,
  TrackerTaskKickoffResult,
  TrackerTaskLinkState,
  TrackerTaskStaveLink,
} from "../../../src/lib/tracker-tasks/types";
import type { CraneTaskJobClaimResponse } from "../atelier-connector/http-client";
import { runtimeOptionsForApproval } from "../crane-connector/runtime";
import { TrackerTaskError } from "./errors";
import type { TrackerTasksPersistence } from "./persistence";

/**
 * Everything kickoff needs from the main process, injected so the whole flow —
 * claim, workspace create, run start, and the kickoff-row write — can be
 * exercised against fakes without an Electron runtime. No credential, lease, or
 * secret crosses this boundary: the Crane claim is opened behind
 * `createCraneTaskJob` and the run is started behind `runLocallyApprovedRun`.
 */
export interface TrackerTaskKickoffDependencies {
  persistence: Pick<
    TrackerTasksPersistence,
    "getTrackerTask" | "upsertTrackerTaskKickoff"
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
    projectPath: string;
    workspace: CraneDispatchWorkspaceChoice;
    runtime: CraneDispatchRuntimeChoice;
  }): Promise<{ jobId: string; workspaceId: string; taskId: string }>;
  listKnownProjects(): Promise<
    Array<{
      projectPath: string;
      defaultBranch: string;
      workspaces: Array<{ id: string }>;
    }>
  >;
  createWorkspace(args: {
    projectPath: string;
    name: string;
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
  task: TrackerTask,
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

export async function kickoffTrackerTask(
  deps: TrackerTaskKickoffDependencies,
  args: TrackerTaskKickoffArgs,
): Promise<TrackerTaskKickoffResult> {
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
  const cached = deps.persistence.getTrackerTask(args.source, args.taskRef);
  const task: TrackerTask = cached ?? detail;

  const persistKickoff = (fields: {
    workspaceId: string;
    staveTaskId: string | null;
    craneJobId: string | null;
    state: TrackerTaskLinkState;
  }): string => {
    const stamp = nowIso();
    const link: TrackerTaskStaveLink = {
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
    deps.persistence.upsertTrackerTaskKickoff(link);
    return link.id;
  };

  // Crane write-back: open an already-claimed job and let the connector runtime
  // launch it exactly as a locally approved dispatch would.
  if (args.craneWriteBack) {
    if (!(await deps.craneWriteBackAvailable())) {
      throw new TrackerTaskError("crane_connector_disabled");
    }
    let claimed: CraneTaskJobClaimResponse;
    try {
      claimed = await deps.createCraneTaskJob({
        taskRef: args.taskRef,
        instruction: args.instruction,
      });
    } catch {
      throw new TrackerTaskError("crane_claim_failed");
    }
    await assertProjectRegistered(deps, args.projectPath);
    let launched: { jobId: string; workspaceId: string; taskId: string };
    try {
      launched = await deps.kickoffClaimedJob({
        claimed,
        projectPath: args.projectPath,
        workspace: args.workspace,
        runtime: args.runtime,
      });
    } catch {
      throw new TrackerTaskError("crane_kickoff_failed");
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
  const project = await assertProjectRegistered(deps, args.projectPath);
  const workspaceId = await resolveWorkspaceId(deps, project, args.workspace);

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
        title: buildTrackerTaskTitle(task),
        prompt: buildTrackerTaskInstruction(task, detail),
      },
    };
  }

  const retrievedContext = buildTrackerTaskRetrievedContext({
    detail,
    instruction: args.instruction,
  });
  let run: { workspaceId: string; taskId: string };
  try {
    run = await deps.runLocallyApprovedRun({
      workspaceId,
      prompt: buildTrackerTaskPrompt(task),
      title: buildTrackerTaskTitle(task),
      provider: args.runtime.provider,
      runtimeOptions: runtimeOptionsForApproval({ runtime: args.runtime }),
      retrievedContextParts: [retrievedContext],
    });
  } catch {
    throw new TrackerTaskError("provider_start_failed");
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

async function assertProjectRegistered(
  deps: TrackerTaskKickoffDependencies,
  projectPath: string,
): Promise<{
  projectPath: string;
  defaultBranch: string;
  workspaces: Array<{ id: string }>;
}> {
  const projects = await deps.listKnownProjects();
  const project = projects.find(
    (candidate) => candidate.projectPath === projectPath,
  );
  if (!project) {
    throw new TrackerTaskError("project_not_registered");
  }
  return project;
}

async function resolveWorkspaceId(
  deps: TrackerTaskKickoffDependencies,
  project: {
    projectPath: string;
    defaultBranch: string;
    workspaces: Array<{ id: string }>;
  },
  workspace: CraneDispatchWorkspaceChoice,
): Promise<string> {
  if (workspace.strategy === "existing") {
    const existing = project.workspaces.find(
      (candidate) => candidate.id === workspace.workspaceId,
    );
    if (!existing) {
      throw new TrackerTaskError("workspace_not_found");
    }
    return existing.id;
  }
  try {
    const created = await deps.createWorkspace({
      projectPath: project.projectPath,
      name: workspace.branchName,
      mode: "branch",
      fromBranch: project.defaultBranch,
      fromBranchKind: "remote",
    });
    return created.workspaceId;
  } catch {
    throw new TrackerTaskError("workspace_create_failed");
  }
}

async function registerIssues(
  deps: TrackerTaskKickoffDependencies,
  workspaceId: string,
  source: TrackerSourceId,
  task: TrackerTask,
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
