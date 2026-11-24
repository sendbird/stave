import { expect, test } from "bun:test";
import { WORKSPACE_SCRATCH_CHANGED_CHANNEL, type WorkspaceScratchChangedEvent } from "../src/lib/workspace-scratch";
import { createWorkspaceScratchBridge } from "../src/lib/workspace-scratch-bridge";

function fakeIpc(watchResult: unknown = { ok: true, watching: true }) {
  const calls: [string, unknown][] = [];
  let push: ((payload: unknown) => void) | null = null;
  const bridge = createWorkspaceScratchBridge({
    invoke: async (channel, args) => {
      calls.push([channel, args]);
      return channel === "fs:watch-scratch" ? watchResult : { ok: true };
    },
    on: (channel, listener) => {
      if (channel === WORKSPACE_SCRATCH_CHANGED_CHANNEL) push = listener;
    },
  });
  return { bridge, calls, push: (event: WorkspaceScratchChangedEvent) => push?.(event) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a window holds one subscription per folder and drops it with the last listener", async () => {
  const { bridge, calls, push } = fakeIpc();
  const panel: WorkspaceScratchChangedEvent[] = [];
  const rail: WorkspaceScratchChangedEvent[] = [];
  const stopPanel = bridge.subscribe("/ws/a", (event) => panel.push(event));
  const stopRail = bridge.subscribe("/ws/a/", (event) => rail.push(event));
  await settle();
  expect(calls).toEqual([["fs:watch-scratch", { rootPath: "/ws/a" }]]);
  expect(panel).toEqual([{ rootPath: "/ws/a", watching: true }]);
  expect(rail).toEqual([{ rootPath: "/ws/a", watching: true }]);

  push({ rootPath: "/ws/a", watching: true });
  push({ rootPath: "/ws/other", watching: true });
  expect(panel).toHaveLength(2);

  stopPanel();
  await settle();
  expect(calls).toHaveLength(1);
  stopRail();
  stopRail();
  await settle();
  expect(calls).toEqual([
    ["fs:watch-scratch", { rootPath: "/ws/a" }],
    ["fs:unwatch-scratch", { rootPath: "/ws/a" }],
  ]);
  push({ rootPath: "/ws/a", watching: true });
  expect(panel).toHaveLength(2);
});

test("re-subscribing in the same turn keeps the watcher; a refused watch reports polling", async () => {
  const { bridge, calls } = fakeIpc({ ok: false, stderr: "Not a known workspace folder." });
  const events: WorkspaceScratchChangedEvent[] = [];
  const stop = bridge.subscribe("/ws/a", (event) => events.push(event));
  await settle();
  stop();
  const stopAgain = bridge.subscribe("/ws/a", (event) => events.push(event));
  await settle();
  expect(calls.map(([channel]) => channel)).toEqual(["fs:watch-scratch"]);
  expect(events.every((event) => event.watching === false)).toBe(true);
  stopAgain();
});

test("a failed watcher's notice switches listeners to polling", async () => {
  const { bridge, push } = fakeIpc();
  const events: WorkspaceScratchChangedEvent[] = [];
  bridge.subscribe("/ws/a", (event) => events.push(event));
  await settle();
  push({ rootPath: "/ws/a", watching: false });
  expect(events.at(-1)).toEqual({ rootPath: "/ws/a", watching: false });
});
