import { describe, expect, test } from "bun:test";

import {
  kickoffTrackerTask,
  type TrackerTaskKickoffDependencies,
} from "../electron/main/tracker-tasks/kickoff";
import { TrackerTaskError } from "../electron/main/tracker-tasks/errors";
import type { CraneTaskJobClaimResponse } from "../electron/main/atelier-connector/http-client";
import type { TrackerSourceAdapter } from "../src/lib/tracker-tasks/source";
import type {
  CraneDispatchRuntimeChoice,
  CraneDispatchWorkspaceChoice,
} from "../src/lib/crane-connector/types";
import type {
  TrackerSourceId,
  TrackerTaskDetail,
  TrackerTaskKickoffArgs,
  TrackerTaskStaveLink,
} from "../src/lib/tracker-tasks/types";

const RUNTIME: CraneDispatchRuntimeChoice = {
  provider: "codex",
  model: "gpt-5.6",
  providerTimeoutMs: 43_200_000,
  codexFileAccess: "workspace-write",
  codexNetworkAccess: false,
  codexApprovalPolicy: "on-request",
  codexWebSearch: "live",
  codexReasoningEffort: "xhigh",
  codexFastMode: false,
  advisorTarget: null,
};

const NEW_WORKSPACE: CraneDispatchWorkspaceChoice = {
  strategy: "new",
  branchName: "feature/CRN-1",
};

const PROJECT_PATH = "/tmp/project";

function makeDetail(source: TrackerSourceId, ref = "CRN-1"): TrackerTaskDetail {
  return {
    source,
    ref,
    key: ref,
    title: `Ticket ${ref}`,
    url: `https://tracker.example.com/${ref}`,
    status: { raw: "In Progress", category: "in_progress" },
    priority: { raw: "High", level: "high" },
    assignee: null,
    labels: [],
    dueDate: null,
    effort: null,
    project: null,
    team: null,
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    closedAt: null,
    description: "Fix the sync loop end to end.",
  };
}

function makeArgs(
  overrides: Partial<TrackerTaskKickoffArgs> = {},
): TrackerTaskKickoffArgs {
  return {
    source: "crane",
    taskRef: "CRN-1",
    projectPath: PROJECT_PATH,
    workspace: NEW_WORKSPACE,
    runtime: RUNTIME,
    instruction: "Work on CRN-1 with a regression test first.",
    startMode: "run",
    craneWriteBack: false,
    ...overrides,
  };
}

function makeAdapter(detail: TrackerTaskDetail): TrackerSourceAdapter {
  return {
    sourceId: detail.source,
    capabilities: {
      kickoffWriteBack: detail.source === "crane",
      detail: true,
    },
    availability: async () => "ready",
    listTasks: async () => ({ tasks: [], truncated: false }),
    getTask: async () => detail,
  };
}

const CLAIM: CraneTaskJobClaimResponse = {
  job: {
    version: 1,
    id: "job-9",
    kind: "run_task",
    connectorId: "connector-1",
    issue: {
      id: "issue-9",
      key: "CRN-1",
      title: "Ticket CRN-1",
      description: "Fix the sync loop end to end.",
      href: "https://tracker.example.com/CRN-1",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    instruction: "Work on CRN-1 with a regression test first.",
    requestedAt: "2026-01-02T00:00:00.000Z",
    expiresAt: "2026-01-03T00:00:00.000Z",
  } as CraneTaskJobClaimResponse["job"],
  leaseId: "stl_lease-9",
  leaseExpiresAt: "2026-01-02T00:15:00.000Z",
  nextSequence: 1,
  retryAfterMs: 15_000,
};

interface HarnessOptions {
  source?: TrackerSourceId;
  craneWriteBackAvailable?: boolean;
  projectRegistered?: boolean;
}

function makeDeps(options: HarnessOptions = {}) {
  const source = options.source ?? "crane";
  const detail = makeDetail(source);
  const kickoffs: TrackerTaskStaveLink[] = [];
  const calls = {
    createCraneTaskJob: 0,
    kickoffClaimedJob: [] as unknown[],
    createWorkspace: [] as unknown[],
    runLocallyApprovedRun: [] as unknown[],
    registerWorkspaceIssues: [] as unknown[],
  };
  const deps: TrackerTaskKickoffDependencies = {
    persistence: {
      getTrackerTask: () => null,
      upsertTrackerTaskKickoff: (link) => {
        kickoffs.push(link);
      },
    },
    getAdapter: () => makeAdapter(detail),
    craneWriteBackAvailable: () => options.craneWriteBackAvailable ?? true,
    createCraneTaskJob: async () => {
      calls.createCraneTaskJob += 1;
      return CLAIM;
    },
    kickoffClaimedJob: async (args) => {
      calls.kickoffClaimedJob.push(args);
      return { jobId: "job-9", workspaceId: "ws-9", taskId: "task-9" };
    },
    listKnownProjects: async () =>
      options.projectRegistered === false
        ? []
        : [
            {
              projectPath: PROJECT_PATH,
              defaultBranch: "main",
              workspaces: [{ id: "ws-existing" }],
            },
          ],
    createWorkspace: async (args) => {
      calls.createWorkspace.push(args);
      return { workspaceId: "ws-new" };
    },
    runLocallyApprovedRun: async (args) => {
      calls.runLocallyApprovedRun.push(args);
      return { workspaceId: args.workspaceId, taskId: "task-run" };
    },
    registerWorkspaceIssues: async (args) => {
      calls.registerWorkspaceIssues.push(args);
    },
    now: () => new Date("2026-02-01T00:00:00.000Z"),
    generateId: () => "kickoff-fixed",
  };
  return { deps, kickoffs, calls, detail };
}

describe("kickoffTrackerTask Crane write-back", () => {
  test("claims once, forwards the claim, and records a running job", async () => {
    const { deps, kickoffs, calls } = makeDeps();
    const result = await kickoffTrackerTask(
      deps,
      makeArgs({ craneWriteBack: true, startMode: "run" }),
    );

    expect(calls.createCraneTaskJob).toBe(1);
    expect(calls.kickoffClaimedJob.length).toBe(1);
    expect((calls.kickoffClaimedJob[0] as { claimed: unknown }).claimed).toBe(
      CLAIM,
    );
    expect(result.craneJobId).toBe("job-9");
    expect(result.staged).toBeNull();
    expect(kickoffs[0]?.state).toBe("running");
    expect(kickoffs[0]?.craneJobId).toBe("job-9");
    // No workspace is created locally: the connector runtime owns that path.
    expect(calls.createWorkspace.length).toBe(0);
  });
});

describe("kickoffTrackerTask Jira run", () => {
  test("creates a workspace and starts a run with the ticket context", async () => {
    const { deps, kickoffs, calls } = makeDeps({ source: "jira" });
    const result = await kickoffTrackerTask(
      deps,
      makeArgs({ source: "jira", startMode: "run" }),
    );

    expect(calls.createWorkspace.length).toBe(1);
    expect(calls.runLocallyApprovedRun.length).toBe(1);
    const run = calls.runLocallyApprovedRun[0] as {
      retrievedContextParts: Array<{ type: string }>;
      prompt: string;
    };
    expect(run.retrievedContextParts.length).toBe(1);
    expect(run.retrievedContextParts[0]?.type).toBe("retrieved_context");
    expect(run.prompt).toContain("CRN-1");
    expect(result.taskId).toBe("task-run");
    expect(result.craneJobId).toBeNull();
    expect(kickoffs[0]?.state).toBe("running");
    expect(kickoffs[0]?.staveTaskId).toBe("task-run");
  });
});

describe("kickoffTrackerTask stage", () => {
  test("does not create a task and returns the staged draft", async () => {
    const { deps, kickoffs, calls } = makeDeps({ source: "jira" });
    const result = await kickoffTrackerTask(
      deps,
      makeArgs({ source: "jira", startMode: "stage" }),
    );

    expect(calls.runLocallyApprovedRun.length).toBe(0);
    expect(result.staged).not.toBeNull();
    expect(result.staged?.title).toContain("CRN-1");
    expect(result.staged?.prompt).toContain("CRN-1");
    expect(result.taskId).toBeNull();
    expect(kickoffs[0]?.state).toBe("staged");
    expect(kickoffs[0]?.staveTaskId).toBeNull();
  });
});

describe("kickoffTrackerTask failures", () => {
  test("throws project_not_registered for an unknown project", async () => {
    const { deps } = makeDeps({ source: "jira", projectRegistered: false });
    await expect(
      kickoffTrackerTask(deps, makeArgs({ source: "jira" })),
    ).rejects.toMatchObject({ code: "project_not_registered" });
  });

  test("throws crane_connector_disabled when write-back is unavailable", async () => {
    const { deps, calls } = makeDeps({ craneWriteBackAvailable: false });
    await expect(
      kickoffTrackerTask(deps, makeArgs({ craneWriteBack: true })),
    ).rejects.toBeInstanceOf(TrackerTaskError);
    // The claim is never opened once the gate closes.
    expect(calls.createCraneTaskJob).toBe(0);
  });
});
