import { create } from "zustand";
import type { RecentRepositoryState } from "@/store/repository.utils";

export const WORKSPACE_CREATION_STEPS = ["worktree", "copy", "setup", "task"] as const;
export type WorkspaceCreationStep = (typeof WORKSPACE_CREATION_STEPS)[number];
type StepStatus = "waiting" | "running" | "complete" | "skipped" | "failed";
type StepState = { status: StepStatus; detail?: string; retry?: () => Promise<void> };
export type WorkspaceCreationProgress = {
  taskTitle: string;
  prompt?: string;
  steps: Record<WorkspaceCreationStep, StepState>;
};

export const useWorkspaceCreationStore = create<{
  byId: Record<string, WorkspaceCreationProgress | undefined>;
}>(() => ({ byId: {} }));

export function beginWorkspaceCreation(workspaceId: string, task: { taskTitle: string; prompt?: string }) {
  const waiting: StepState = { status: "waiting" };
  useWorkspaceCreationStore.setState(({ byId }) => ({
    byId: { ...byId, [workspaceId]: { ...task, steps: { worktree: waiting, copy: waiting, setup: waiting, task: waiting } } },
  }));

  const update = (step: WorkspaceCreationStep, value: StepState) => {
    useWorkspaceCreationStore.setState(({ byId }) => {
      const current = byId[workspaceId];
      if (!current) return { byId };
      return { byId: { ...byId, [workspaceId]: { ...current, steps: { ...current.steps, [step]: value } } } };
    });
  };

  return {
    current: () => useWorkspaceCreationStore.getState().byId[workspaceId],
    update,
    finish() {
      useWorkspaceCreationStore.setState(({ byId }) => {
        if (WORKSPACE_CREATION_STEPS.some((step) => byId[workspaceId]?.steps[step].status === "failed")) return { byId };
        const next = { ...byId };
        delete next[workspaceId];
        return { byId: next };
      });
    },
  };
}

export function isWorkspacePreparing(progress: WorkspaceCreationProgress | undefined) {
  return !!progress && (
    progress.steps.worktree.status !== "complete"
    || ["waiting", "running"].includes(progress.steps.copy.status)
    || ["waiting", "running", "failed"].includes(progress.steps.setup.status)
  );
}

export function isWorkspaceCheckoutPending(workspaceId: string) {
  const step = useWorkspaceCreationStore.getState().byId[workspaceId]?.steps.worktree;
  return !!step && step.status !== "complete";
}

type CreationStepResult = Omit<StepState, "retry" | "status"> & { status: "complete" | "skipped" | "failed" };

export function runWorkspaceCreationSteps(
  progress: ReturnType<typeof beginWorkspaceCreation>,
  handlers: Record<WorkspaceCreationStep, () => Promise<CreationStepResult | void>>,
) {
  let running = false;
  const runFrom = async (start: number) => {
    if (running) return;
    running = true;
    try {
      for (let index = start; index < WORKSPACE_CREATION_STEPS.length; index++) {
        const step = WORKSPACE_CREATION_STEPS[index]!;
        progress.update(step, { status: "running" });
        try {
          const result = await handlers[step]();
          progress.update(step, result ?? { status: "complete" });
        } catch (error) {
          const detail = (error instanceof Error ? error.message : String(error)).slice(-16_384);
          progress.update(step, {
            status: "failed", detail,
            // A first send with an unknown outcome must never be replayed.
            retry: step === "task" ? undefined : async () => {
              if (progress.current()?.steps[step].status !== "failed") return;
              await runFrom(index).catch(() => {});
            },
          });
          throw error;
        }
      }
      progress.finish();
    } finally {
      running = false;
    }
  };
  return runFrom(0);
}


export function getPendingWorkspaceCheckouts() {
  return Object.keys(useWorkspaceCreationStore.getState().byId).filter(isWorkspaceCheckoutPending);
}

type WorkspaceRegistration = Pick<RecentRepositoryState,
  "workspaces" | "activeWorkspaceId" | "workspacePathById" | "workspaceBranchById" | "workspaceDefaultById" | "workspaceLastActiveAtById"
>;

export function withoutPendingWorkspaceRows<T extends WorkspaceRegistration>(repository: T, pending: string[]): T {
  if (!repository.workspaces.some(({ id }) => pending.includes(id))) return repository;
  const keep = <Value,>(values: Record<string, Value>) => Object.fromEntries(
    Object.entries(values).filter(([id]) => !pending.includes(id)),
  );
  return {
    ...repository,
    workspaces: repository.workspaces.filter(({ id }) => !pending.includes(id)),
    activeWorkspaceId: pending.includes(repository.activeWorkspaceId)
      ? repository.workspaces.find(({ id }) => repository.workspaceDefaultById[id])?.id ?? ""
      : repository.activeWorkspaceId,
    workspacePathById: keep(repository.workspacePathById),
    workspaceBranchById: keep(repository.workspaceBranchById),
    workspaceDefaultById: keep(repository.workspaceDefaultById),
    workspaceLastActiveAtById: keep(repository.workspaceLastActiveAtById ?? {}),
  };
}

export function withoutPendingWorkspaceRegistrations(repositories: RecentRepositoryState[], pending: string[]) {
  return pending.length ? repositories.map((repository) => withoutPendingWorkspaceRows(repository, pending)) : repositories;
}
