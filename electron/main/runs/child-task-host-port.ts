import { buildChildTaskRuntimeOptions } from "../../../src/lib/runs/child-task-runtime";
import type { ChildTaskHostPort } from "./child-task-coordinator";

/**
 * The adapter between the child-task coordinator and the real task machinery.
 *
 * Its one non-obvious responsibility is *when* `runTask` resolves. The local
 * MCP `run-task` action resolves as soon as the provider turn has started —
 * that is its documented contract for every other caller. A delegation,
 * though, settles its ledger row the moment `runTask` resolves, and settling
 * at turn *start* breaks every contract the ledger makes: a one-turn child is
 * "completed" while it is still streaming, the per-parent concurrency limit
 * stops bounding actually-running turns, and a detached child parks `waiting`
 * mid-turn so a follow-up collides with the still-active turn. So this
 * adapter starts the turn and then waits for the turn to *end* — via the
 * host's own task-turn-updated `done` signal, with a status poll as the
 * backstop for a signal that was emitted before the subscription existed or
 * never emitted at all (a hard-stopped turn, a restarted host).
 *
 * Built from injected primitives so tests can drive a fake turn feed; the
 * production wiring lives in `child-task-coordinator-instance.ts`.
 */

const DEFAULT_TURN_END_POLL_INTERVAL_MS = 15_000;

export interface ChildTaskTurnUpdate {
  workspaceId: string;
  taskId: string;
  turnId: string;
  done: boolean;
}

export interface ChildTaskHostTaskStatus {
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnCompletedAt: string | null;
  latestTurnError: string | null;
}

export interface ChildTaskHostPortDependencies {
  listKnownProjects: () => Promise<
    Array<{
      projectPath: string;
      workspaces: Array<{ id: string; path: string }>;
    }>
  >;
  createWorkspace: (args: {
    projectPath: string;
    name: string;
    mode: "branch";
    fromBranch?: string;
  }) => Promise<{
    workspaceId: string;
    workspacePath: string;
    projectPath: string;
  }>;
  getTaskStatus: (args: {
    workspaceId: string;
    taskId: string;
    turnId?: string;
  }) => Promise<ChildTaskHostTaskStatus>;
  /** Starts a provider turn and resolves at turn start — the MCP contract. */
  startTaskTurn: (args: {
    workspaceId: string;
    taskId: string;
    parentTaskId: string;
    prompt: string;
    title?: string;
    provider: "claude-code" | "codex";
    runtimeOptions: ReturnType<typeof buildChildTaskRuntimeOptions>;
  }) => Promise<{ turnId: string }>;
  stopTask: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<unknown>;
  /** Clears the delegation stamp on a detached child task. */
  releaseTaskParent: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<unknown>;
  /** Push feed of persisted turn updates; returns an unsubscribe. */
  subscribeTaskTurnUpdated: (
    listener: (update: ChildTaskTurnUpdate) => void,
  ) => () => void;
  pollIntervalMs?: number;
}

function isNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\bnot found\b/i.test(message);
}

export function createChildTaskHostPort(
  dependencies: ChildTaskHostPortDependencies,
): ChildTaskHostPort {
  const pollIntervalMs =
    dependencies.pollIntervalMs ?? DEFAULT_TURN_END_POLL_INTERVAL_MS;

  /**
   * Resolves once the started turn is no longer the task's active turn.
   *
   * Never rejects. A host that cannot be reached right now is retried on the
   * next poll rather than read as a finished turn — closing a delegation is
   * the one thing a transient error must not do. The only errors that end the
   * wait are "not found" ones: a task or workspace that no longer exists has
   * no turn left to wait on.
   */
  const waitForTurnEnd = (args: {
    workspaceId: string;
    taskId: string;
    turnId: string;
  }) =>
    new Promise<void>((resolve) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      const settle = () => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe();
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        resolve();
      };
      const unsubscribe = dependencies.subscribeTaskTurnUpdated((update) => {
        if (
          update.taskId === args.taskId &&
          update.turnId === args.turnId &&
          update.done
        ) {
          settle();
        }
      });
      const check = async () => {
        if (settled) {
          return;
        }
        try {
          const status = await dependencies.getTaskStatus({
            workspaceId: args.workspaceId,
            taskId: args.taskId,
          });
          if (status.activeTurnId !== args.turnId) {
            settle();
            return;
          }
        } catch (error) {
          if (isNotFoundError(error)) {
            settle();
            return;
          }
          // Unreachable host: the turn may well still be running. Poll again.
        }
        if (!settled) {
          pollTimer = setTimeout(() => {
            void check();
          }, pollIntervalMs);
          pollTimer.unref?.();
        }
      };
      // The immediate check covers a turn that ended before the subscription
      // above existed — its `done` event is gone, but the status is not.
      void check();
    });

  /** The turn's terminal error, if it ended with one. Best effort. */
  const readTurnError = async (args: {
    workspaceId: string;
    taskId: string;
    turnId: string;
  }) => {
    try {
      const status = await dependencies.getTaskStatus(args);
      return status.latestTurnId === args.turnId
        ? status.latestTurnError
        : null;
    } catch {
      return null;
    }
  };

  return {
    async resolveWorkspace({ workspaceId }) {
      const projects = await dependencies.listKnownProjects();
      for (const project of projects) {
        const workspace = project.workspaces.find(
          (candidate) => candidate.id === workspaceId,
        );
        if (workspace) {
          return {
            workspaceId,
            workspacePath: workspace.path,
            projectPath: project.projectPath,
          };
        }
      }
      return null;
    },

    async createWorkspace({ projectPath, name, fromBranch }) {
      const created = await dependencies.createWorkspace({
        projectPath,
        name,
        mode: "branch",
        ...(fromBranch ? { fromBranch } : {}),
      });
      return {
        workspaceId: created.workspaceId,
        workspacePath: created.workspacePath,
        projectPath: created.projectPath,
      };
    },

    async getTaskStatus({ workspaceId, taskId }) {
      try {
        const status = await dependencies.getTaskStatus({
          workspaceId,
          taskId,
        });
        return {
          ok: true,
          activeTurnId: status.activeTurnId,
          latestTurnId: status.latestTurnId,
          latestTurnCompletedAt: status.latestTurnCompletedAt,
          latestTurnError: status.latestTurnError,
        };
      } catch (error) {
        // The host runtime throws `Task not found:` / `Workspace not found:`
        // for something that genuinely no longer exists. Anything else — a
        // host service that is still starting, a dropped request — must not
        // be read as an absent child.
        return {
          ok: false,
          reason: isNotFoundError(error) ? "missing" : "unavailable",
        };
      }
    },

    async runTask({
      workspaceId,
      taskId,
      title,
      prompt,
      providerId,
      model,
      permissionProfile,
      parentTaskId,
    }) {
      const started = await dependencies.startTaskTurn({
        workspaceId,
        taskId,
        parentTaskId,
        prompt,
        ...(title ? { title } : {}),
        provider: providerId,
        runtimeOptions: buildChildTaskRuntimeOptions({
          providerId,
          model,
          permissionProfile,
        }),
      });
      // The delegation settles on the turn's *end*, so resolve only then. A
      // stop or cancel during this wait ends the turn (which resolves the
      // wait naturally) and moves the ledger row to a terminal phase first,
      // so whatever this returns can no longer double-settle the step.
      await waitForTurnEnd({
        workspaceId,
        taskId,
        turnId: started.turnId,
      });
      const turnError = await readTurnError({
        workspaceId,
        taskId,
        turnId: started.turnId,
      });
      if (turnError) {
        // Mirrors the restart reconcile path: a turn that ended with a
        // terminal error fails the delegation with that error. A turn ended
        // by the parent's own stop lands here too, but by then the row is
        // already cancelled and the coordinator records nothing further.
        throw new Error(turnError);
      }
      return { turnId: started.turnId };
    },

    async stopTask(args) {
      return dependencies.stopTask(args);
    },

    async releaseTaskParent(args) {
      return dependencies.releaseTaskParent(args);
    },
  };
}
