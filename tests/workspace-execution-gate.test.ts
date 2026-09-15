import { expect, test } from "bun:test";
import { WorkspaceExecutionGate } from "../electron/shared/workspace-execution-gate";
import { WorkspaceExecutionArgsSchema } from "../src/lib/performance/workspace-execution";

const target = { workspaceId: "w", workspacePath: "/tmp/workspace" };

test("stop refuses an admitted turn, then blocks all starts until explicit resume", async () => {
  const gate = new WorkspaceExecutionGate();
  const release = gate.acquire({ workspaceId: "w" });
  let closed = false;
  await expect(gate.stop(target, async () => { closed = true; })).rejects.toThrow("running");
  expect(closed).toBe(false);
  release();
  let finish!: () => void;
  const stopping = gate.stop(target, () => new Promise<void>((resolve) => { finish = resolve; }));
  expect(() => gate.acquire({ workspaceId: "w" })).toThrow("stopped");
  expect(() => gate.resume("w")).toThrow("finish");
  expect(() => gate.assertAllowed({ workspaceId: "other" })).not.toThrow();
  finish(); await stopping;
  expect(() => gate.assertAllowed({ cwd: "/tmp/workspace/src" })).toThrow("stopped");
  expect(() => gate.assertAllowed({ cwd: "/tmp/workspace-other" })).not.toThrow();
  gate.resume("w");
  expect(() => gate.assertAllowed({ workspaceId: "w" })).not.toThrow();
});

test("failed close stays stopped and unknown active ownership blocks stop", async () => {
  const gate = new WorkspaceExecutionGate();
  const release = gate.acquire({});
  await expect(gate.stop(target, async () => {})).rejects.toThrow("running");
  release();
  await expect(gate.stop(target, async () => { throw new Error("close failed"); })).rejects.toThrow("close failed");
  expect(gate.snapshot()).toEqual([{ workspaceId: "w", stopping: false, failed: true }]);
  expect(() => gate.acquire({ workspaceId: "w" })).toThrow();
  gate.resume("w");
  expect(gate.snapshot()).toEqual([]);
});

test("execution contract rejects unknown actions and fields", () => {
  expect(WorkspaceExecutionArgsSchema.safeParse({ ...target, action: "stop" }).success).toBe(true);
  expect(WorkspaceExecutionArgsSchema.safeParse({ ...target, action: "delete" }).success).toBe(false);
  expect(WorkspaceExecutionArgsSchema.safeParse({ ...target, action: "stop", force: true }).success).toBe(false);
});
