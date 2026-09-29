/**
 * Intake: the one sequence that turns a request into a workspace, an idle
 * task and, optionally, a mission started on that task.
 *
 * It owns the order and the refusals, not the bookkeeping. The caller records
 * an idempotency key before calling and keeps each id as `progress` reports
 * it, so a restart can tell how far a start got and never replays one. A
 * project keeps them on its proposal; a direct assignment will keep them on
 * its own record.
 *
 * Boundaries it upholds: intake is the only path that creates a workspace and
 * a task for supervised work, and a mission never creates a task — intake
 * creates the lead task and hands its id to the mission.
 *
 * Used by: `project-runtime.ts`.
 */
import type { MissionStartInput } from "../../../src/lib/missions/domain";
import type { ProviderId } from "../../../src/lib/providers/provider.types";

/** Same words as a delegated task's workspace strategy. */
export type IntakeWorkspace =
  | {
      mode: "new-worktree";
      repositoryPath: string;
      /** Branch and worktree name. Must be new: intake never reuses a branch's workspace. */
      branch: string;
      label: string;
    }
  | { mode: "same-workspace"; workspaceId: string };

export interface IntakeRequest<P extends ProviderId = ProviderId> {
  workspace: IntakeWorkspace;
  task: {
    title: string;
    provider: P;
    /** The model the task's composer starts on; absent for the provider default. */
    model?: string | null;
  };
  /** Start a mission on the new task. Without it the task is left idle. */
  mission?: Omit<MissionStartInput, "workspaceId" | "leadTaskId">;
}

export interface IntakePorts<P extends ProviderId = ProviderId> {
  createWorktree: (args: {
    repositoryPath: string;
    name: string;
    label: string;
  }) => Promise<{ workspaceId: string; existed?: boolean }>;
  createIdleTask: (args: {
    workspaceId: string;
    title: string;
    provider: P;
    model?: string | null;
  }) => Promise<{ taskId: string }>;
  /** Required when a request names a mission. */
  startMission?: (input: MissionStartInput) => Promise<{ missionId: string }>;
}

/** Called after each step succeeds and before the next one begins. */
export interface IntakeProgress {
  workspaceReady?: (workspaceId: string) => void;
  taskReady?: (taskId: string) => void;
}

export type IntakeStep = "workspace" | "task" | "mission";

export class IntakeError extends Error {
  constructor(
    readonly step: IntakeStep,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}

export interface IntakeResult {
  workspaceId: string;
  taskId: string;
  missionId: string | null;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function prepareWorkspace(workspace: IntakeWorkspace, ports: Pick<IntakePorts, "createWorktree">): Promise<string> {
  if (workspace.mode === "same-workspace") return workspace.workspaceId;
  let created: { workspaceId: string; existed?: boolean };
  try {
    created = await ports.createWorktree({
      repositoryPath: workspace.repositoryPath,
      name: workspace.branch,
      label: workspace.label,
    });
  } catch (error) {
    throw new IntakeError("workspace", messageOf(error, "The worktree could not be created."), error);
  }
  if (created.existed) {
    throw new IntakeError(
      "workspace",
      `A workspace on the branch "${workspace.branch}" already exists; new work needs a worktree of its own.`,
    );
  }
  return created.workspaceId;
}

export async function runIntake<P extends ProviderId>(
  request: IntakeRequest<P>,
  ports: IntakePorts<P>,
  progress: IntakeProgress = {},
): Promise<IntakeResult> {
  if (request.mission && !ports.startMission) {
    throw new IntakeError("mission", "This intake cannot start missions.");
  }

  const workspaceId = await prepareWorkspace(request.workspace, ports);
  progress.workspaceReady?.(workspaceId);

  let taskId: string;
  try {
    ({ taskId } = await ports.createIdleTask({
      workspaceId,
      title: request.task.title,
      provider: request.task.provider,
      model: request.task.model,
    }));
  } catch (error) {
    throw new IntakeError("task", messageOf(error, "The task could not be created."), error);
  }
  progress.taskReady?.(taskId);

  if (!request.mission) return { workspaceId, taskId, missionId: null };

  try {
    const { missionId } = await ports.startMission!({ ...request.mission, workspaceId, leadTaskId: taskId });
    return { workspaceId, taskId, missionId };
  } catch (error) {
    throw new IntakeError("mission", messageOf(error, "The mission could not start."), error);
  }
}
