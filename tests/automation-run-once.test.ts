import { describe, expect, test } from "bun:test";
import { createAutomationRuntime } from "../electron/host-service/automation-runtime";
import {
  AutomationStateSchema, AutomationUpsertInputSchema, createDefaultAutomationRuntime, createEmptyAutomationState, type AutomationState, type AutomationUpsertInput,
} from "@/lib/automations";
import { formatAutomationCadence } from "@/lib/automation-presentation";
import { automationScheduleRow } from "@/lib/schedule-rows";
import { automationToDraft } from "@/components/layout/automation-center/automation-center.utils";

/**
 * One-time schedules, created under a caller's id, and the saved-state
 * listener, in the Schedules service itself: the real scheduler over an
 * in-memory state, with a fake clock, interval and task runner.
 */

const START = "2026-11-10T08:00:00.000Z";
const ONCE_AT = "2026-11-11T15:00:00.000Z";

function input(overrides: Partial<AutomationUpsertInput> = {}): AutomationUpsertInput {
  return { name: "Look at this again", prompt: "Look at the release branch again.", enabled: true, schedule: { every: 1, unit: "days", at: { hour: 15, minute: 0 } },
    environment: { kind: "repository", workspaceId: "ws-1", path: "/tmp/project", repositoryPath: "/tmp/project", label: "Project" },
    runtime: createDefaultAutomationRuntime("codex"), trustPolicy: "review-required", maxConcurrentRuns: 1, informationReferences: [], ...overrides };
}

function harness() {
  let state: AutomationState = createEmptyAutomationState();
  let now = new Date(START);
  let tick: (() => Promise<void>) | null = null;
  const runs: unknown[] = [];
  const saved: AutomationState[] = [];
  let active = true;
  const runtime = createAutomationRuntime({
    persistence: { loadAutomationState: () => structuredClone(state), saveAutomationState: ({ state: next }) => { state = structuredClone(next); },
      loadAutomationProviderTimeoutMs: () => null, saveAutomationProviderTimeoutMs: () => undefined, completeTurn: () => undefined },
    runTask: async (args) => { runs.push(args); return { workspaceId: args.workspaceId, taskId: "task-1", taskTitle: args.title, turnId: "turn-1", provider: args.provider, model: "m" }; },
    getTaskStatus: async ({ workspaceId, taskId }) => ({ workspaceId, taskId, activeTurnId: active ? "turn-1" : null, latestTurnId: "turn-1",
      latestTurnCompletedAt: active ? null : now.toISOString(), latestTurnError: null, latestAssistantText: null, pendingApprovals: [], pendingUserInputs: [] }),
    getWorkspaceInformation: async () => { throw new Error("not used"); },
    onStateSaved: (next) => { saved.push(next); },
    now: () => new Date(now),
    setInterval: ((callback: () => Promise<void>) => { tick = callback; return 1; }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => { tick = null; }) as typeof globalThis.clearInterval,
  });
  runtime.start();
  return { runtime, runs, saved, state: () => state, setNow: (value: string) => { now = new Date(value); }, finish: () => { active = false; }, tick: async () => { await tick?.(); } };
}

describe("one-time schedules in the Schedules service", () => {
  test("it runs once at its instant, then turns itself off and never fires again", async () => {
    const h = harness();
    const created = await h.runtime.create(input({ runOnceAt: ONCE_AT }));
    expect(created).toMatchObject({ runOnceAt: ONCE_AT, enabled: true, nextRunAt: ONCE_AT });
    h.setNow("2026-11-11T14:59:00.000Z");
    await h.tick();
    expect(h.runs).toHaveLength(0);
    h.setNow("2026-11-11T15:00:03.000Z");
    await h.tick();
    expect(h.runs).toHaveLength(1);
    expect(h.state().runs[0]).toMatchObject({ trigger: "scheduled", scheduledFor: ONCE_AT, status: "running" });
    expect(h.state().automations[0]).toMatchObject({ enabled: false, nextRunAt: null, runOnceAt: ONCE_AT, lastRunAt: "2026-11-11T15:00:03.000Z" });
    h.finish();
    h.setNow("2026-11-12T15:00:03.000Z");
    await h.tick();
    expect(h.runs).toHaveLength(1);
  });

  test("a run missed while Stave was closed happens once when it opens", async () => {
    const h = harness();
    await h.runtime.create(input({ runOnceAt: ONCE_AT }));
    h.setNow("2026-11-14T09:00:00.000Z");
    await h.tick();
    expect(h.runs).toHaveLength(1);
    expect(h.state().automations[0]).toMatchObject({ enabled: false, nextRunAt: null });
  });

  test("a time that has passed cannot be saved on or turned on; saved off it stays off", async () => {
    const h = harness();
    await expect(h.runtime.create(input({ runOnceAt: "2026-11-10T07:00:00.000Z" }))).rejects.toThrow("already passed");
    const paused = await h.runtime.create(input({ runOnceAt: ONCE_AT, enabled: false }));
    expect(paused).toMatchObject({ enabled: false, nextRunAt: null });
    h.setNow("2026-11-12T00:00:00.000Z");
    await expect(h.runtime.setEnabled({ id: paused.id, enabled: true })).rejects.toThrow("already passed");
    await expect(h.runtime.update({ id: paused.id, input: input({ runOnceAt: ONCE_AT, enabled: true }) })).rejects.toThrow("already passed");
    // Editing it while off, or choosing a new time, is fine.
    expect(await h.runtime.update({ id: paused.id, input: input({ runOnceAt: ONCE_AT, enabled: false, name: "Renamed" }) })).toMatchObject({ name: "Renamed", nextRunAt: null });
    expect(await h.runtime.update({ id: paused.id, input: input({ runOnceAt: "2026-11-13T15:00:00.000Z" }) })).toMatchObject({ enabled: true, nextRunAt: "2026-11-13T15:00:00.000Z" });
  });

  test("Run now keeps a one-time schedule's instant; removing the one-time field makes it repeat", async () => {
    const h = harness();
    const created = await h.runtime.create(input({ runOnceAt: ONCE_AT }));
    expect(await h.runtime.runNow({ id: created.id })).toMatchObject({ trigger: "manual" });
    expect(h.state().automations[0]).toMatchObject({ enabled: true, nextRunAt: ONCE_AT });
    const repeating = await h.runtime.update({ id: created.id, input: input() });
    expect(repeating.runOnceAt).toBeUndefined();
    expect(Date.parse(repeating.nextRunAt!)).toBeGreaterThan(Date.parse(START));
  });

  test("a one-time run skipped at its concurrency limit turns off instead of retrying every tick", async () => {
    const h = harness();
    const created = await h.runtime.create(input({ runOnceAt: ONCE_AT }));
    await h.runtime.runNow({ id: created.id });
    h.setNow("2026-11-11T15:00:03.000Z");
    await h.tick();
    await h.tick();
    expect(h.state().runs.filter((run) => run.status === "skipped")).toHaveLength(1);
    expect(h.state().automations[0]).toMatchObject({ enabled: false, nextRunAt: null });
  });

  test("a repeating schedule's saved shape and config hash are unchanged by the one-time field", async () => {
    const h = harness();
    const created = await h.runtime.create(input());
    expect(Object.keys(created)).not.toContain("runOnceAt");
    expect(AutomationStateSchema.parse(h.state()).automations[0]).not.toHaveProperty("runOnceAt");
    expect(AutomationUpsertInputSchema.safeParse(input({ runOnceAt: "tomorrow" })).success).toBe(false);
  });
});

describe("a schedule created under a caller's id", () => {
  test("is created once; the same id again returns the first and changes nothing", async () => {
    const h = harness();
    const first = await h.runtime.create(input({ name: "First" }), { id: "tars-abc" });
    const again = await h.runtime.create(input({ name: "Second", enabled: false }), { id: "tars-abc" });
    expect(first.id).toBe("tars-abc");
    expect(again).toEqual(first);
    expect(h.state().automations).toHaveLength(1);
    // Without an id every create is a new schedule, as before.
    await h.runtime.create(input());
    expect(h.state().automations).toHaveLength(2);
  });
});

describe("the saved-state listener", () => {
  test("hears every committed change, and a listener that throws never stops the scheduler", async () => {
    let state: AutomationState = createEmptyAutomationState();
    const runtime = createAutomationRuntime({
      persistence: { loadAutomationState: () => structuredClone(state), saveAutomationState: ({ state: next }) => { state = structuredClone(next); },
        loadAutomationProviderTimeoutMs: () => null, saveAutomationProviderTimeoutMs: () => undefined, completeTurn: () => undefined },
      runTask: async () => { throw new Error("not used"); }, getTaskStatus: async () => { throw new Error("not used"); },
      getWorkspaceInformation: async () => { throw new Error("not used"); },
      onStateSaved: () => { throw new Error("listener failed"); },
    });
    const error = console.error;
    console.error = () => undefined;
    try { expect(await runtime.create(input({ enabled: false }))).toMatchObject({ name: "Look at this again" }); }
    finally { console.error = error; }
    expect(state.automations).toHaveLength(1);

    const h = harness();
    const created = await h.runtime.create(input({ enabled: false }));
    await h.runtime.setEnabled({ id: created.id, enabled: true });
    expect(h.saved.map((entry) => entry.automations[0]?.enabled)).toEqual([false, true]);
  });
});

describe("a one-time schedule on the Schedules screen", () => {
  test("its row and detail say when it runs once, and an edit keeps it one-time", async () => {
    const h = harness();
    const created = await h.runtime.create(input({ runOnceAt: ONCE_AT }));
    const cadence = formatAutomationCadence(created);
    expect(cadence).toContain("Once on");
    expect(cadence).toContain("2026");
    expect(automationScheduleRow(created, null)).toMatchObject({ cadence, state: "on", nextRunAt: ONCE_AT });
    expect(automationToDraft(created).runOnceAt).toBe(ONCE_AT);
    // A repeating schedule reads as it always did, and its draft has no one-time field.
    const repeating = await h.runtime.create(input());
    expect(formatAutomationCadence(repeating)).not.toContain("Once");
    expect(automationToDraft(repeating)).not.toHaveProperty("runOnceAt");
  });
});
