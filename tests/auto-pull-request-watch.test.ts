import { afterEach, describe, expect, test } from "bun:test";
import {
  ensureCreatedPullRequestWatch,
  watchCreatedPullRequest,
} from "../src/components/layout/pull-request/auto-pull-request-watch";
import { DEFAULT_PULL_REQUEST_WATCH_PROMPT } from "../src/lib/supervision/pull-request-watch";
import type { WakeUpsBridgeApi } from "../src/lib/supervision/wake-up-bridge";
import type { WakeUp, WakeUpUpsertInput } from "../src/lib/supervision/wake-up-policy";
import { defaultSettings } from "../src/store/app-settings";

const TASK = {
  id: "task-1",
  title: "Add uploads",
  provider: "claude-code" as const,
  archivedAt: null,
  controlMode: "interactive" as const,
};

function fakeApi(existing: Array<Partial<WakeUp>> = [], createResult?: { ok: boolean; message?: string }) {
  const created: WakeUpUpsertInput[] = [];
  let listed = 0;
  const api: Pick<WakeUpsBridgeApi, "list" | "create"> = {
    list: async () => {
      listed += 1;
      return { ok: true, wakeUps: existing as WakeUp[], summaries: [] };
    },
    create: async (input) => {
      created.push(input);
      return createResult && !createResult.ok
        ? { ok: false, wakeUp: null, message: createResult.message }
        : { ok: true, wakeUp: { id: "watch-1" } as WakeUp };
    },
  };
  return { api, created, listCalls: () => listed };
}

describe("automatic pull request watch on Create PR", () => {
  test("watches the pull request with failing checks and conflicts only", async () => {
    const { api, created } = fakeApi();
    const outcome = await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: TASK, api });
    expect(outcome).toEqual({ kind: "created", wakeUpId: "watch-1" });
    expect(created).toEqual([
      {
        workspaceId: "ws-1",
        taskId: "task-1",
        prompt: DEFAULT_PULL_REQUEST_WATCH_PROMPT,
        // Review comments stay opt-in per task.
        trigger: { kind: "pull_request", events: ["checks_failed", "merge_conflict"] },
        maxOccurrences: null,
        expiresAt: null,
      },
    ]);
  });

  test("does nothing when the setting is off", async () => {
    const { api, created, listCalls } = fakeApi();
    expect(await ensureCreatedPullRequestWatch({ enabled: false, workspaceId: "ws-1", task: TASK, api })).toEqual({
      kind: "disabled",
    });
    expect(created).toEqual([]);
    expect(listCalls()).toBe(0);
  });

  test("keeps an existing watch and never replaces another schedule", async () => {
    const watching = fakeApi([{ id: "w", taskId: "task-1", state: "scheduled", trigger: { kind: "pull_request", events: ["checks_failed"] } }]);
    expect(await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: TASK, api: watching.api })).toEqual({
      kind: "already-watching",
      wakeUpId: "w",
    });
    expect(watching.created).toEqual([]);

    const scheduled = fakeApi([{ id: "s", taskId: "task-1", state: "paused", trigger: { kind: "completion" } }]);
    expect(await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: TASK, api: scheduled.api })).toEqual({
      kind: "task-has-schedule",
      wakeUpId: "s",
    });
    expect(scheduled.created).toEqual([]);

    // A stopped one is replaced, as creating any schedule replaces it.
    const stopped = fakeApi([{ id: "x", taskId: "task-1", state: "stopped", trigger: { kind: "completion" } }]);
    expect((await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: TASK, api: stopped.api })).kind).toBe(
      "created",
    );
  });

  test("skips tasks a wake-up cannot run and reports a refused write", async () => {
    const { api, created } = fakeApi();
    expect(await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: null, api })).toMatchObject({ reason: "no-task" });
    expect(
      await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: { ...TASK, provider: "cursor" }, api }),
    ).toMatchObject({ reason: "unsupported-provider" });
    expect(
      await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: { ...TASK, controlMode: "managed" }, api }),
    ).toMatchObject({ reason: "managed-task" });
    expect(await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: TASK, api: null })).toMatchObject({
      reason: "bridge-unavailable",
    });
    expect(created).toEqual([]);

    const refused = fakeApi([], { ok: false, message: "An agent run owns this task." });
    expect(await ensureCreatedPullRequestWatch({ enabled: true, workspaceId: "ws-1", task: TASK, api: refused.api })).toEqual({
      kind: "failed",
      message: "An agent run owns this task.",
    });
  });
});

describe("watchCreatedPullRequest", () => {
  const globals = globalThis as { window?: unknown };
  const previousWindow = globals.window;
  afterEach(() => {
    globals.window = previousWindow;
  });

  test("reads the setting and the task that created the pull request", async () => {
    expect(defaultSettings.createPrWatchEnabled).toBe(true);
    const { api, created } = fakeApi();
    globals.window = { api: { wakeUps: api } };
    const state = { settings: { createPrWatchEnabled: true }, tasks: [TASK, { ...TASK, id: "task-2" }] };
    expect((await watchCreatedPullRequest({ state, workspaceId: "ws-1", taskId: "task-1" })).kind).toBe("created");
    expect(created.map((entry) => entry.taskId)).toEqual(["task-1"]);

    const off = await watchCreatedPullRequest({
      state: { ...state, settings: { createPrWatchEnabled: false } },
      workspaceId: "ws-1",
      taskId: "task-1",
    });
    expect(off.kind).toBe("disabled");
    expect(created).toHaveLength(1);
  });
});
