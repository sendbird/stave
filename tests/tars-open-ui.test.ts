import { afterEach, expect, test } from "bun:test";
import { useAppStore } from "../src/store/app.store";
import { navigateTarsOpen } from "../src/components/tars/use-tars-open";
import type { TarsResponsibility } from "../src/lib/tars/types";

const original = useAppStore.getState();
afterEach(() => useAppStore.setState(original, true));

test("open activity and Fleet navigate the UI without invoking work controls", async () => {
  const calls: string[] = [];
  useAppStore.setState({ openFleetView: () => { calls.push("fleet"); } });
  await navigateTarsOpen({ kind: "open", target: "activity" }, [], () => calls.push("activity"));
  await navigateTarsOpen({ kind: "open", target: "fleet" }, [], () => calls.push("activity"));
  expect(calls).toEqual(["activity", "fleet"]);
});

test("a task opens in its own repository and execution workspace, and unknown tasks never navigate", async () => {
  const calls: unknown[] = [];
  useAppStore.setState({ tasks: [{ id: "task" }] as typeof original.tasks,
    focusTaskAttention: async args => { calls.push(args); }, exitToWorkspace: from => { calls.push(from); } });
  const row = { taskId: "task", workspaceId: "source", executionWorkspaceId: "execution", repositoryPath: "/tmp/owner" } as TarsResponsibility;
  await navigateTarsOpen({ kind: "open", target: "task", id: "task" }, [row], () => {});
  expect(calls).toEqual([{ taskId: "task", workspaceId: "execution", repositoryPath: "/tmp/owner", refreshFromPersistence: true }, "tars"]);
  await expect(navigateTarsOpen({ kind: "open", target: "task", id: "unknown" }, [row], () => {})).rejects.toThrow();
  expect(calls).toHaveLength(2);
  useAppStore.setState({ tasks: [] });
  await expect(navigateTarsOpen({ kind: "open", target: "task", id: "task" }, [row], () => {})).rejects.toThrow();
  expect(calls).toHaveLength(3); // Focus read failed; never exit to a missing task.
});

test("workspace navigation resolves the current registry and verifies the switch before leaving Tars", async () => {
  const calls: string[] = [];
  useAppStore.setState({ repositoryPath: "/tmp/other", activeWorkspaceId: "other",
    recentRepositories: [{ repositoryPath: "/tmp/owner", workspaces: [{ id: "source" }] }] as typeof original.recentRepositories,
    workspaces: [{ id: "source" }] as typeof original.workspaces,
    openRepository: async ({ repositoryPath }) => { calls.push(repositoryPath); },
    refreshWorkspaces: async () => { calls.push("refresh"); },
    switchWorkspace: async ({ workspaceId }) => { calls.push(workspaceId); useAppStore.setState({ activeWorkspaceId: workspaceId }); },
    exitToWorkspace: () => { calls.push("exit"); } });
  await navigateTarsOpen({ kind: "open", target: "workspace", id: "source" }, [], () => {});
  expect(calls).toEqual(["/tmp/owner", "refresh", "source", "exit"]);
  await expect(navigateTarsOpen({ kind: "open", target: "workspace", id: "unknown" }, [], () => {})).rejects.toThrow();
  expect(calls).toHaveLength(4);
  useAppStore.setState({ activeWorkspaceId: "other", switchWorkspace: async () => {} });
  await expect(navigateTarsOpen({ kind: "open", target: "workspace", id: "source" }, [], () => {})).rejects.toThrow();
  expect(calls.filter(call => call === "exit")).toHaveLength(1);
});
