import { afterEach, expect, test } from "bun:test";
import {
  beginWorkspaceCreation,
  isWorkspaceCheckoutPending,
  isWorkspacePreparing,
  runWorkspaceCreationSteps,
  useWorkspaceCreationStore,
} from "../src/store/workspace-creation-progress";

const id = "worktree:test";
const read = () => useWorkspaceCreationStore.getState().byId[id];

afterEach(() => useWorkspaceCreationStore.setState({ byId: {} }));

test("publishes the first prompt before checkout and completes in stage order", async () => {
  const progress = beginWorkspaceCreation(id, { taskTitle: "Review", prompt: "Check the changes" });
  const seen: string[] = [];
  await runWorkspaceCreationSteps(progress, {
    worktree: async () => {
      expect(isWorkspaceCheckoutPending(id)).toBe(true);
      expect(read()).toMatchObject({ prompt: "Check the changes", steps: { worktree: { status: "running" } } });
      seen.push("worktree");
    },
    copy: async () => {
      expect(isWorkspaceCheckoutPending(id)).toBe(false);
      expect(read()?.steps.worktree.status).toBe("complete");
      seen.push("copy");
    },
    setup: async () => {
      expect(isWorkspacePreparing(read())).toBe(true);
      seen.push("setup");
    },
    task: async () => {
      expect(isWorkspacePreparing(read())).toBe(false);
      seen.push("task");
    },
  });
  expect(seen).toEqual(["worktree", "copy", "setup", "task"]);
  expect(read()).toBeUndefined();
});

test("preserves failure details and retries only the failed stage and later steps", async () => {
  let checkouts = 0;
  let setups = 0;
  let launches = 0;
  const progress = beginWorkspaceCreation(id, { taskTitle: "Review" });
  await expect(runWorkspaceCreationSteps(progress, {
    worktree: async () => { checkouts++; },
    copy: async () => ({ status: "skipped" }),
    setup: async () => { if (++setups === 1) throw new Error("setup exited with code 1"); },
    task: async () => { launches++; },
  })).rejects.toThrow("setup exited with code 1");
  expect(read()?.steps.setup).toMatchObject({ status: "failed", detail: "setup exited with code 1" });
  expect(read()?.steps.task.status).toBe("waiting");
  expect(isWorkspacePreparing(read())).toBe(true);
  const retry = read()?.steps.setup.retry;
  expect(retry).toBeDefined();
  await Promise.all([retry?.(), retry?.()]);
  expect({ checkouts, setups, launches }).toEqual({ checkouts: 1, setups: 2, launches: 1 });
  expect(read()).toBeUndefined();
});

test("keeps a first-turn failure available without offering a duplicate send", async () => {
  const progress = beginWorkspaceCreation(id, { taskTitle: "Review" });
  await runWorkspaceCreationSteps(progress, {
    worktree: async () => {},
    copy: async () => ({ status: "skipped" }),
    setup: async () => ({ status: "skipped" }),
    task: async () => ({ status: "failed", detail: "Start unconfirmed" }),
  });
  const task = read()?.steps.task;
  expect(task).toMatchObject({ status: "failed", detail: "Start unconfirmed" });
  expect(task?.retry).toBeUndefined();
  // Each step records when it ran, for its elapsed time.
  expect(task?.endedAt).toBeGreaterThanOrEqual(task?.startedAt ?? Number.POSITIVE_INFINITY);
  expect(isWorkspacePreparing(read())).toBe(false);
});
