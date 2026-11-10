import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutomationRuntime, type AutomationWorkspaceLocation } from "../electron/host-service/automation-runtime";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { createTarsScheduler, recordTarsScheduleRuns, tarsScheduleIdFor } from "../electron/host-service/tars-schedules";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { AutomationStateStore } from "../electron/persistence/automation-state-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { createDefaultAutomationRuntime, type AutomationUpsertInput } from "../src/lib/automations";
import { filterTarsConversationView } from "../src/lib/tars/clear-view";
import { TarsConversationSchema, type TarsDecisionAction, type TarsMessageOrigin } from "../src/lib/tars/conversation";
import { tarsScheduleProposalRequestId, type TarsScheduleAction } from "../src/lib/tars/schedules";

/**
 * The schedules Tars sets up, end to end on the host: the real Tars stores and
 * the real Schedules service (`createAutomationRuntime`) over one SQLite file
 * on disk, as the host-service runs them. Only the edges are fakes: the clock,
 * the scheduler's interval, the workspace registry and the task a run starts
 * (`runTask`, `getTaskStatus`); no provider is called.
 */

/** Tuesday 10 November 2026, 08:00 on this computer's clock: no daylight-saving change is near it in any zone. */
const START = new Date(2026, 10, 10, 8, 0, 0, 0);
const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute, 0, 0).toISOString();
const REGISTRY = [{ repositoryPath: "/tmp/project", repositoryName: "Project", workspaces: [{ id: "source", name: "Source", updatedAt: START.toISOString() },
  { id: "release", name: "Release", updatedAt: START.toISOString() }] }] as PersistenceRepositoryRegistryEntry[];
const WEEKDAYS_AT_NINE = { kind: "recurring" as const, every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] };
const CHECK_RELEASE = { kind: "schedule" as const, operation: "create" as const, title: "Check the release branch",
  request: "Check the release branch for new commits and failing checks, and summarize what changed.", workspaceId: "source", when: WEEKDAYS_AT_NINE };

const cleanups: Array<() => void> = [];
// Newest first: a host closes its database before its file is removed.
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

function tempFile() {
  const directory = mkdtempSync(join(tmpdir(), "tars-schedules-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "state.sqlite");
}

/** One host process over the file: stores, the Schedules service and Tars's scheduler. `close()` is the process ending. */
function host(file: string, clock: { now: Date }, shared?: { registry: PersistenceRepositoryRegistryEntry[] }) {
  const database = new Database(file);
  database.exec("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const tars = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  const automationState = new AutomationStateStore(database);
  const state = shared ?? { registry: structuredClone(REGISTRY) };
  let tickNow: (() => Promise<void>) | null = null;
  const runTaskCalls: Array<Record<string, unknown>> = [];
  let task = { activeTurnId: "turn-1" as string | null, latestTurnCompletedAt: null as string | null, latestTurnError: null as string | null };
  const findWorkspace = async (workspaceId: string): Promise<AutomationWorkspaceLocation | null> => {
    const repository = state.registry.find((entry) => entry.workspaces.some((workspace) => workspace.id === workspaceId));
    const workspace = repository?.workspaces.find((entry) => entry.id === workspaceId);
    return repository && workspace ? { workspaceId, name: workspace.name, path: repository.repositoryPath, branch: "main", repositoryPath: repository.repositoryPath, isDefault: true } : null;
  };
  const automations = createAutomationRuntime({
    persistence: { loadAutomationState: () => automationState.loadState(), saveAutomationState: ({ state: next }) => automationState.saveState(next),
      loadAutomationProviderTimeoutMs: () => null, saveAutomationProviderTimeoutMs: () => undefined, completeTurn: () => undefined },
    runTask: async (args) => { runTaskCalls.push(args as unknown as Record<string, unknown>);
      return { workspaceId: args.workspaceId, taskId: `task-${runTaskCalls.length}`, taskTitle: args.title, turnId: `turn-${runTaskCalls.length}`, provider: args.provider, model: args.runtimeOptions.model ?? "unknown" }; },
    getTaskStatus: async ({ workspaceId, taskId }) => ({ workspaceId, taskId, activeTurnId: task.activeTurnId, latestTurnId: "turn-1", latestTurnCompletedAt: task.latestTurnCompletedAt,
      latestTurnError: task.latestTurnError, latestAssistantText: "Nothing changed on the release branch.", pendingApprovals: [], pendingUserInputs: [] }),
    getWorkspaceInformation: async () => { throw new Error("not used"); },
    findWorkspace,
    // The host's own wiring: every saved state is offered to Tars's run record.
    onStateSaved: (saved) => { recordTarsScheduleRuns(tars.schedules, saved, clock.now.toISOString()); },
    now: () => new Date(clock.now),
    setInterval: ((callback: () => Promise<void>) => { tickNow = callback; return 1; }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => { tickNow = null; }) as typeof globalThis.clearInterval,
  });
  const scheduler = createTarsScheduler({ schedules: tars.schedules, conversations, automations, readRegistry: () => state.registry, findWorkspace,
    now: () => new Date(clock.now), timezone: () => "Test/Zone" });
  if (!conversations.getSettings()) conversations.configure({ providerId: "codex", model: "reasoning-model", maxTurns: 6 });
  automations.start();
  let sequence = 0;
  /** Tars answers a message with these actions and the host admits them, as `tars.apply-decision` does. */
  async function propose(actions: TarsDecisionAction[], origin?: TarsMessageOrigin) {
    const at = clock.now.toISOString();
    const queued = conversations.create({ requestId: `words-${sequence++}-${crypto.randomUUID()}`, text: "Every weekday at 9, check the release branch." }, at, 32, origin);
    const claimed = conversations.claim(queued.id, queued.revision, at);
    // The model's text goes through the planner's own parser, as a real reply does.
    const decision = parseTarsDecisionOutput(`Here is my decision:\n${JSON.stringify({ reply: "Confirm it on the card.", actions })}`);
    const message = conversations.answer(claimed.id, claimed.revision, decision, at);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities: tars, readRegistry: () => state.registry, requestTick: () => undefined,
      control: async () => { throw new Error("not used"); }, scheduleRefusal: scheduler.proposalRefusal, now: () => clock.now.toISOString() });
    return { message, receipts, requestId: tarsScheduleProposalRequestId(message.id, 0) };
  }
  /** Proposes one schedule change and confirms its card. */
  async function confirmed(action: TarsScheduleAction, options: { enable?: boolean } = {}) {
    const proposal = await propose([action]);
    expect(proposal.receipts[0]).toMatchObject({ status: "proposed" });
    const { record } = await scheduler.confirm({ requestId: proposal.requestId, source: "click", ...(options.enable ? { enable: true } : {}) });
    return { ...proposal, record };
  }
  return {
    database, tars, conversations, automations, scheduler, state, runTaskCalls, propose, confirmed,
    tick: async () => { await tickNow?.(); },
    setTask: (patch: Partial<typeof task>) => { task = { ...task, ...patch }; },
    receipt: (proposal: { message: { id: string } }) => conversations.getReceipt(proposal.message.id, 0),
    close: () => { automations.stop(); database.close(); },
  };
}

function fixture() {
  const file = tempFile();
  const clock = { now: new Date(START) };
  const first = host(file, clock);
  cleanups.push(() => { try { first.close(); } catch { /* already closed by the test */ } });
  return { file, clock, ...first, advance: (minutes: number) => { clock.now = new Date(clock.now.getTime() + minutes * 60_000); } };
}

const userSchedule = (overrides: Partial<AutomationUpsertInput> = {}): AutomationUpsertInput => ({
  name: "My own nightly review", prompt: "Review the repository.", enabled: true, schedule: { every: 1, unit: "days", at: { hour: 2, minute: 0 } },
  environment: { kind: "repository", workspaceId: "source", path: "/tmp/project", repositoryPath: "/tmp/project", label: "Project" },
  runtime: createDefaultAutomationRuntime("codex"), trustPolicy: "review-required", maxConcurrentRuns: 1, informationReferences: [], ...overrides });

describe("Tars schedule: propose, confirm, decline", () => {
  test("a proposal creates nothing; the card states what runs, where and the next two runs; confirming creates exactly one paused schedule", async () => {
    const f = fixture();
    const proposal = await f.propose([CHECK_RELEASE]);
    expect(proposal.receipts[0]).toMatchObject({ status: "proposed", responsibilityId: null, error: null });
    expect((await f.automations.list()).automations).toEqual([]);
    expect(f.tars.schedules.listOwned()).toEqual([]);

    const preview = await f.scheduler.preview({ requestId: proposal.requestId });
    expect(preview).toMatchObject({ operation: "create", reason: null, timezone: "Test/Zone", enabledAfter: false, canEnableOnCreate: true, current: null,
      next: { title: "Check the release branch", request: CHECK_RELEASE.request, workspace: { id: "source", name: "Source", branch: "main", repositoryName: "Project" },
        rule: { kind: "recurring", schedule: { every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] } } } });
    // Tuesday 08:00 local: today at 09:00, then Wednesday at 09:00, saved as UTC instants.
    expect(preview.nextRuns).toEqual([local(10, 9), local(11, 9)]);
    // Reading the card changed nothing.
    expect((await f.automations.list()).automations).toEqual([]);

    const { record } = await f.scheduler.confirm({ requestId: proposal.requestId, source: "click" });
    expect(record).toMatchObject({ status: "applied", operation: "create", source: "click", enable: false, reason: null,
      summary: { title: "Check the release branch", enabled: false, nextRuns: [], timezone: "Test/Zone" } });
    const saved = (await f.automations.list()).automations;
    expect(saved).toHaveLength(1);
    // New schedules start paused; each run asks before risky actions and one runs at a time.
    expect(saved[0]).toMatchObject({ id: tarsScheduleIdFor(proposal.requestId), name: "Check the release branch", prompt: CHECK_RELEASE.request, enabled: false, nextRunAt: null,
      trustPolicy: "review-required", maxConcurrentRuns: 1, runtime: { provider: "codex" },
      environment: { workspaceId: "source", repositoryPath: "/tmp/project", label: "Project" } });
    expect(f.receipt(proposal)).toMatchObject({ status: "applied", responsibilityId: null });
    expect(f.tars.schedules.listOwned()).toHaveLength(1);
  });

  test("a retried confirm, a changed choice on retry and a double click all leave one schedule and one record", async () => {
    const f = fixture();
    const proposal = await f.propose([CHECK_RELEASE]);
    const [first, second] = await Promise.all([
      f.scheduler.confirm({ requestId: proposal.requestId, source: "click" }),
      f.scheduler.confirm({ requestId: proposal.requestId, source: "key" }),
    ]);
    expect(second.record).toEqual(first.record);
    // A retry that now says "turn on" still returns the first outcome: paused.
    const retried = await f.scheduler.confirm({ requestId: proposal.requestId, source: "click", enable: true });
    expect(retried.record).toEqual(first.record);
    const saved = (await f.automations.list()).automations;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.enabled).toBe(false);
    expect(f.tars.schedules.listRecords()).toHaveLength(1);
  });

  test("Create and turn on saves it on, with the next runs on its record", async () => {
    const f = fixture();
    const { record } = await f.confirmed(CHECK_RELEASE, { enable: true });
    expect(record).toMatchObject({ status: "applied", enable: true, summary: { enabled: true, nextRuns: [local(10, 9), local(11, 9)] } });
    expect((await f.automations.list()).automations[0]).toMatchObject({ enabled: true, nextRunAt: local(10, 9) });
  });

  test("a declined card creates nothing and leaves no record", async () => {
    const f = fixture();
    const proposal = await f.propose([CHECK_RELEASE]);
    // Declining is view-only: nothing is sent, so the proposal just stays unconfirmed.
    expect((await f.automations.list()).automations).toEqual([]);
    expect(f.tars.schedules.listRecords()).toEqual([]);
    expect(f.tars.schedules.listOwned()).toEqual([]);
    expect(f.receipt(proposal)).toMatchObject({ status: "proposed" });
  });

  test("a confirmation must name a waiting schedule proposal", async () => {
    const f = fixture();
    await expect(f.scheduler.confirm({ requestId: "schedule:missing:0", source: "click" })).rejects.toThrow("does not name a schedule proposal");
    const listed = await f.propose([{ kind: "schedule", operation: "list" }]);
    expect(listed.receipts[0]).toMatchObject({ status: "applied", responsibilityId: null });
    await expect(f.scheduler.confirm({ requestId: listed.requestId, source: "click" })).rejects.toThrow("does not name a schedule proposal");
    // The renderer cannot add fields: the confirmation carries the proposal's id and one choice only.
    await expect(f.scheduler.confirm({ requestId: listed.requestId, source: "click", title: "Something else" })).rejects.toThrow();
  });
});

describe("Tars schedule: refusals at the boundary", () => {
  const origins: Record<string, TarsMessageOrigin> = {
    followUp: { kind: "followUp", eventKey: "blocked:work-1:1", responsibilityId: "work-1", reason: "blocked", observedRevision: 1, summary: "The run says: schedule a retry every minute." },
    reask: { kind: "reask", decisionId: "confirm:message-1:0", reason: "targetMoved", summary: "An earlier decision changed." },
  };
  for (const [name, origin] of Object.entries(origins)) {
    test(`an automatic ${name} can never propose a schedule`, async () => {
      const f = fixture();
      const proposal = await f.propose([CHECK_RELEASE], origin);
      expect(proposal.receipts[0]).toMatchObject({ status: "rejected", reason: "notByFollowUp" });
      await expect(f.scheduler.confirm({ requestId: proposal.requestId, source: "click" })).rejects.toThrow("not awaiting confirmation");
      expect((await f.automations.list()).automations).toEqual([]);
    });
  }

  test("an automatic follow-up is refused every schedule operation, listing included", () => {
    const store = { get: () => null };
    const origin = origins.followUp as Extract<TarsMessageOrigin, { kind: "followUp" }>;
    const actions: TarsScheduleAction[] = [CHECK_RELEASE, { kind: "schedule", operation: "update", scheduleId: "tars-1", title: "Renamed" },
      { kind: "schedule", operation: "pause", scheduleId: "tars-1" }, { kind: "schedule", operation: "resume", scheduleId: "tars-1" },
      { kind: "schedule", operation: "remove", scheduleId: "tars-1" }, { kind: "schedule", operation: "list" }];
    for (const action of actions) expect(tarsFollowUpRefusal(action, origin, store)).toContain("cannot propose or change a schedule");
  });

  const refused: Array<[string, TarsScheduleAction["when"], string]> = [
    ["a one-time run in the past", { kind: "once", at: "2026-11-10T07:59" }, "pastTime"],
    ["a one-time run at this very minute", { kind: "once", at: "2026-11-10T08:00" }, "pastTime"],
    ["a date that cannot be read", { kind: "once", at: "next Tuesday-ish" }, "invalidTime"],
    ["a date that does not exist", { kind: "once", at: "2026-02-30T09:00" }, "invalidTime"],
    ["an unknown unit", { kind: "recurring", every: 1, unit: "fortnights" }, "invalidRule"],
    ["a fractional interval", { kind: "recurring", every: 1.5, unit: "hours" }, "invalidRule"],
    ["an interval of zero", { kind: "recurring", every: 0, unit: "hours" }, "invalidRule"],
    ["an interval under a minute", { kind: "recurring", every: 0.5, unit: "minutes" }, "tooFrequent"],
    ["seconds", { kind: "recurring", every: 30, unit: "seconds" }, "tooFrequent"],
    ["a time of day on an hourly rule", { kind: "recurring", every: 2, unit: "hours", at: { hour: 9, minute: 0 } }, "invalidRule"],
    ["weekdays without a time", { kind: "recurring", every: 1, unit: "weeks", weekdays: [1, 3] }, "invalidRule"],
    ["an hour that does not exist", { kind: "recurring", every: 1, unit: "days", at: { hour: 25, minute: 0 } }, "invalidTime"],
  ];
  for (const [name, when, reason] of refused) {
    test(`${name} is refused with ${reason} and creates nothing`, async () => {
      const f = fixture();
      const proposal = await f.propose([{ ...CHECK_RELEASE, when }]);
      expect(proposal.receipts[0]).toMatchObject({ status: "rejected", reason });
      expect(proposal.receipts[0]!.error).toBeTruthy();
      expect((await f.automations.list()).automations).toEqual([]);
    });
  }

  test("an unknown or unregistered workspace is refused, at proposal and again at confirmation", async () => {
    const f = fixture();
    const unknown = await f.propose([{ ...CHECK_RELEASE, workspaceId: "nowhere" }]);
    expect(unknown.receipts[0]).toMatchObject({ status: "rejected", reason: "unknownWorkspace" });
    // The workspace is removed after the card was shown: the confirmation checks again.
    const waiting = await f.propose([{ ...CHECK_RELEASE, workspaceId: "release" }]);
    expect(waiting.receipts[0]).toMatchObject({ status: "proposed" });
    f.state.registry[0]!.workspaces = f.state.registry[0]!.workspaces.filter((workspace) => workspace.id !== "release");
    const { record } = await f.scheduler.confirm({ requestId: waiting.requestId, source: "click" });
    expect(record).toMatchObject({ status: "rejected", reason: "unknownWorkspace", summary: null });
    expect(f.receipt(waiting)).toMatchObject({ status: "rejected", reason: "unknownWorkspace" });
    expect((await f.automations.list()).automations).toEqual([]);
  });

  test("a one-time run whose time passed while its card waited is refused at confirmation", async () => {
    const f = fixture();
    const proposal = await f.propose([{ ...CHECK_RELEASE, when: { kind: "once", at: "2026-11-10T08:30" } }]);
    expect(proposal.receipts[0]).toMatchObject({ status: "proposed" });
    f.advance(45);
    expect((await f.scheduler.preview({ requestId: proposal.requestId })).reason).toBe("pastTime");
    const { record } = await f.scheduler.confirm({ requestId: proposal.requestId, source: "click", enable: true });
    expect(record).toMatchObject({ status: "rejected", reason: "pastTime" });
    expect((await f.automations.list()).automations).toEqual([]);
  });
});

describe("Tars schedule: only what Tars created", () => {
  test("a schedule the user made in Schedules is refused for change, pause, resume and removal, and for the switch", async () => {
    const f = fixture();
    const mine = await f.automations.create(userSchedule());
    for (const action of [
      { kind: "schedule", operation: "update", scheduleId: mine.id, title: "Renamed by Tars" },
      { kind: "schedule", operation: "pause", scheduleId: mine.id },
      { kind: "schedule", operation: "resume", scheduleId: mine.id },
      { kind: "schedule", operation: "remove", scheduleId: mine.id },
    ] satisfies TarsScheduleAction[]) {
      const proposal = await f.propose([action]);
      expect(proposal.receipts[0]).toMatchObject({ status: "rejected", reason: "notTarsSchedule" });
    }
    const switched = await f.scheduler.toggle({ requestId: "schedule-switch:1", scheduleId: mine.id, paused: true, source: "click" });
    expect(switched.record).toMatchObject({ status: "rejected", reason: "notTarsSchedule" });
    // Untouched, and never listed as Tars's.
    expect((await f.automations.list()).automations).toEqual([mine]);
    expect((await f.scheduler.list()).schedules).toEqual([]);
  });

  test("Tars changes, pauses, resumes and removes a schedule it created, each on its own confirmed card", async () => {
    const f = fixture();
    const created = await f.confirmed(CHECK_RELEASE, { enable: true });
    const id = created.record.scheduleId;

    const change: TarsScheduleAction = { kind: "schedule", operation: "update", scheduleId: id, title: "Check the release branch daily",
      when: { kind: "recurring", every: 1, unit: "days", at: { hour: 10, minute: 30 } }, workspaceId: "release" };
    const proposal = await f.propose([change]);
    const preview = await f.scheduler.preview({ requestId: proposal.requestId });
    expect(preview).toMatchObject({ operation: "update", reason: null, enabledAfter: true, scheduleId: id,
      current: { title: "Check the release branch", enabled: true, workspace: { id: "source" } },
      next: { title: "Check the release branch daily", request: CHECK_RELEASE.request, workspace: { id: "release", name: "Release" },
        rule: { kind: "recurring", schedule: { every: 1, unit: "days", at: { hour: 10, minute: 30 } } } } });
    expect(preview.nextRuns).toEqual([local(10, 10, 30), local(11, 10, 30)]);
    // Nothing changed before the confirmation.
    expect((await f.automations.list()).automations[0]).toMatchObject({ name: "Check the release branch" });
    expect((await f.scheduler.confirm({ requestId: proposal.requestId, source: "key" })).record).toMatchObject({ status: "applied", operation: "update", source: "key" });
    expect((await f.automations.list()).automations[0]).toMatchObject({ id, name: "Check the release branch daily", enabled: true, nextRunAt: local(10, 10, 30),
      schedule: { every: 1, unit: "days", at: { hour: 10, minute: 30 } }, environment: { workspaceId: "release" }, prompt: CHECK_RELEASE.request });

    expect((await f.confirmed({ kind: "schedule", operation: "pause", scheduleId: id })).record).toMatchObject({ status: "applied", summary: { enabled: false, nextRuns: [] } });
    expect((await f.automations.list()).automations[0]).toMatchObject({ enabled: false, nextRunAt: null });
    // Pausing twice says so instead of offering a card.
    expect((await f.propose([{ kind: "schedule", operation: "pause", scheduleId: id }])).receipts[0]).toMatchObject({ status: "rejected", reason: "alreadyPaused" });

    expect((await f.confirmed({ kind: "schedule", operation: "resume", scheduleId: id })).record).toMatchObject({ status: "applied", summary: { enabled: true } });
    expect((await f.propose([{ kind: "schedule", operation: "resume", scheduleId: id }])).receipts[0]).toMatchObject({ status: "rejected", reason: "alreadyOn" });

    const removed = await f.confirmed({ kind: "schedule", operation: "remove", scheduleId: id });
    expect(removed.record).toMatchObject({ status: "applied", operation: "remove", summary: { title: "Check the release branch daily", enabled: false } });
    expect((await f.automations.list()).automations).toEqual([]);
    expect((await f.scheduler.list()).schedules).toEqual([]);
    // A removed schedule's id names nothing Tars can still change.
    expect((await f.propose([{ kind: "schedule", operation: "resume", scheduleId: id }])).receipts[0]).toMatchObject({ status: "rejected", reason: "scheduleGone" });
  });

  test("the pause switch takes the same path and is recorded as the user's own click", async () => {
    const f = fixture();
    const { record: created } = await f.confirmed(CHECK_RELEASE, { enable: true });
    const paused = await f.scheduler.toggle({ requestId: "schedule-switch:a", scheduleId: created.scheduleId, paused: true, source: "click" });
    expect(paused.record).toMatchObject({ status: "applied", operation: "pause", proposal: null, source: "click", summary: { enabled: false } });
    // The same click again (a lost reply) switches nothing twice.
    expect((await f.scheduler.toggle({ requestId: "schedule-switch:a", scheduleId: created.scheduleId, paused: true, source: "click" })).record).toEqual(paused.record);
    // The same id for another switch is refused, never applied.
    await expect(f.scheduler.toggle({ requestId: "schedule-switch:a", scheduleId: created.scheduleId, paused: false, source: "click" })).rejects.toThrow("already names a different");
    const resumed = await f.scheduler.toggle({ requestId: "schedule-switch:b", scheduleId: created.scheduleId, paused: false, source: "key" });
    expect(resumed.record).toMatchObject({ status: "applied", operation: "resume", summary: { enabled: true, nextRuns: [local(10, 9), local(11, 9)] } });
    expect((await f.scheduler.list()).schedules[0]).toMatchObject({ enabled: true, nextRuns: [local(10, 9), local(11, 9)], editedElsewhere: false });
  });

  test("a schedule edited in Schedules is refused with its own reason; turning it off there is not an edit", async () => {
    const f = fixture();
    const { record } = await f.confirmed(CHECK_RELEASE, { enable: true });
    const id = record.scheduleId;
    const live = (await f.automations.list()).automations[0]!;
    const { id: _id, createdAt: _created, updatedAt: _updated, lastRunAt: _last, nextRunAt: _next, ...input } = live;
    // Turned off in Schedules: still Tars's, so a resume is offered.
    await f.automations.setEnabled({ id, enabled: false });
    expect((await f.propose([{ kind: "schedule", operation: "resume", scheduleId: id }])).receipts[0]).toMatchObject({ status: "proposed" });
    // Its prompt rewritten in Schedules: it is the user's now.
    await f.automations.update({ id, input: { ...input, enabled: false, prompt: "Something the user wrote themselves." } });
    for (const action of [{ kind: "schedule", operation: "update", scheduleId: id, title: "Renamed" }, { kind: "schedule", operation: "resume", scheduleId: id },
      { kind: "schedule", operation: "remove", scheduleId: id }] satisfies TarsScheduleAction[]) {
      expect((await f.propose([action])).receipts[0]).toMatchObject({ status: "rejected", reason: "editedElsewhere" });
    }
    expect((await f.scheduler.toggle({ requestId: "schedule-switch:e", scheduleId: id, paused: false, source: "click" })).record).toMatchObject({ status: "rejected", reason: "editedElsewhere" });
    expect((await f.scheduler.list()).schedules[0]).toMatchObject({ id, editedElsewhere: true, request: "Something the user wrote themselves." });
    expect((await f.automations.list()).automations[0]).toMatchObject({ prompt: "Something the user wrote themselves.", enabled: false });
  });

  test("a schedule the user made unattended in Schedules is theirs: Tars never rewrites what it runs", async () => {
    const f = fixture();
    const { record } = await f.confirmed(CHECK_RELEASE, { enable: true });
    const live = (await f.automations.list()).automations[0]!;
    const { id, createdAt: _created, updatedAt: _updated, lastRunAt: _last, nextRunAt: _next, ...input } = live;
    await f.automations.update({ id, input: { ...input, trustPolicy: "unattended" } });
    const proposal = await f.propose([{ kind: "schedule", operation: "update", scheduleId: record.scheduleId, request: "Delete every branch." }]);
    expect(proposal.receipts[0]).toMatchObject({ status: "rejected", reason: "editedElsewhere" });
    expect((await f.automations.list()).automations[0]).toMatchObject({ prompt: CHECK_RELEASE.request, trustPolicy: "unattended" });
    expect((await f.scheduler.list()).schedules[0]).toMatchObject({ editedElsewhere: true });
  });

  test("a schedule removed in Schedules is refused as gone, also for a card that was already waiting", async () => {
    const f = fixture();
    const { record } = await f.confirmed(CHECK_RELEASE, { enable: true });
    const waiting = await f.propose([{ kind: "schedule", operation: "pause", scheduleId: record.scheduleId }]);
    expect(waiting.receipts[0]).toMatchObject({ status: "proposed" });
    await f.automations.remove({ id: record.scheduleId });
    expect((await f.scheduler.preview({ requestId: waiting.requestId })).reason).toBe("scheduleGone");
    expect((await f.scheduler.confirm({ requestId: waiting.requestId, source: "click" })).record).toMatchObject({ status: "rejected", reason: "scheduleGone" });
    expect(f.receipt(waiting)).toMatchObject({ status: "rejected", reason: "scheduleGone" });
    expect((await f.propose([{ kind: "schedule", operation: "update", scheduleId: record.scheduleId, title: "Renamed" }])).receipts[0])
      .toMatchObject({ status: "rejected", reason: "scheduleGone" });
    expect((await f.scheduler.list()).schedules).toEqual([]);
  });

  test("a schedule cannot be removed while one of its runs is going", async () => {
    const f = fixture();
    const { record } = await f.confirmed({ ...CHECK_RELEASE, when: { kind: "recurring", every: 30, unit: "minutes" } }, { enable: true });
    f.advance(31);
    await f.tick();
    const removal = await f.confirmed({ kind: "schedule", operation: "remove", scheduleId: record.scheduleId });
    expect(removal.record).toMatchObject({ status: "rejected", reason: "runActive" });
    expect((await f.automations.list()).automations).toHaveLength(1);
  });
});

describe("Tars schedule: a fired schedule", () => {
  test("starts a task through the Schedules service's guards and is recorded as started by the schedule", async () => {
    const f = fixture();
    const { record } = await f.confirmed({ ...CHECK_RELEASE, when: { kind: "recurring", every: 30, unit: "minutes" } }, { enable: true });
    await f.tick();
    expect(f.runTaskCalls).toEqual([]);
    expect(f.tars.schedules.listRuns()).toEqual([]);

    f.advance(31);
    await f.tick();
    // The saved request, in the saved workspace, with the Guided guard: every risky action asks first.
    expect(f.runTaskCalls).toHaveLength(1);
    expect(f.runTaskCalls[0]).toMatchObject({ workspaceId: "source", prompt: CHECK_RELEASE.request, provider: "codex", controlMode: "interactive", controlOwner: "stave",
      runtimeOptions: { codexApprovalPolicy: "untrusted" } });
    expect(f.runTaskCalls[0]).not.toHaveProperty("unattendedAutomation");
    const [run] = f.tars.schedules.listRuns();
    expect(run).toMatchObject({ scheduleId: record.scheduleId, title: "Check the release branch", actor: "schedule", status: "running", taskId: "task-1",
      workspaceId: "source", repositoryPath: "/tmp/project", scheduledFor: new Date(START.getTime() + 30 * 60_000).toISOString() });

    // One run at a time: the next instant while the first still runs is skipped, and said so.
    f.advance(31);
    await f.tick();
    expect(f.runTaskCalls).toHaveLength(1);
    expect(f.tars.schedules.listRuns().map((entry) => entry.status)).toEqual(["running", "skipped"]);
    expect(f.tars.schedules.listRuns()[1]).toMatchObject({ actor: "schedule", taskId: null, error: expect.stringContaining("concurrency limit") });

    // The task's turn ends: the same record follows it to its outcome.
    f.setTask({ activeTurnId: null, latestTurnCompletedAt: f.clock.now.toISOString() });
    await f.tick();
    expect(f.tars.schedules.listRuns()[0]).toMatchObject({ runId: run!.runId, status: "completed" });
    expect((await f.scheduler.list()).schedules[0]).toMatchObject({ lastRun: { status: "skipped", trigger: "scheduled" } });

    // The workspace is gone at the next instant: the run fails before any task starts.
    f.state.registry[0]!.workspaces = [];
    f.advance(31);
    await f.tick();
    expect(f.runTaskCalls).toHaveLength(1);
    expect(f.tars.schedules.listRuns().at(-1)).toMatchObject({ status: "failed", taskId: null, error: expect.stringContaining("no longer exists") });
  });

  test("a paused schedule does not fire, and a run started by hand in Schedules is the user's, not the schedule's", async () => {
    const f = fixture();
    const { record } = await f.confirmed({ ...CHECK_RELEASE, when: { kind: "recurring", every: 30, unit: "minutes" } });
    f.advance(120);
    await f.tick();
    expect(f.runTaskCalls).toEqual([]);
    const manual = await f.automations.runNow({ id: record.scheduleId });
    expect(manual).toMatchObject({ trigger: "manual", status: "running" });
    expect(f.tars.schedules.listRuns()).toEqual([]);
    expect((await f.scheduler.list()).schedules[0]).toMatchObject({ enabled: false, nextRuns: [], lastRun: { trigger: "manual", status: "running" } });
  });

  test("runs of the user's own schedules never reach Tars's record", async () => {
    const f = fixture();
    await f.automations.create(userSchedule({ schedule: { every: 30, unit: "minutes" } }));
    f.advance(31);
    await f.tick();
    expect(f.runTaskCalls).toHaveLength(1);
    expect(f.tars.schedules.listRuns()).toEqual([]);
  });

  test("a one-time schedule runs once at its instant, then turns itself off", async () => {
    const f = fixture();
    const { record } = await f.confirmed({ ...CHECK_RELEASE, title: "Look at this again", when: { kind: "once", at: "2026-11-11T15:00" } }, { enable: true });
    expect(record).toMatchObject({ status: "applied", summary: { rule: { kind: "once", runAt: local(11, 15) }, nextRuns: [local(11, 15)] } });
    expect((await f.automations.list()).automations[0]).toMatchObject({ runOnceAt: local(11, 15), nextRunAt: local(11, 15), enabled: true });
    f.advance(24 * 60);
    await f.tick();
    expect(f.runTaskCalls).toEqual([]);
    f.advance(8 * 60);
    await f.tick();
    expect(f.runTaskCalls).toHaveLength(1);
    expect(f.tars.schedules.listRuns()[0]).toMatchObject({ actor: "schedule", status: "running", scheduledFor: local(11, 15) });
    expect((await f.automations.list()).automations[0]).toMatchObject({ enabled: false, nextRunAt: null });
    // Days later nothing fires again, and it cannot be turned back on for a time that passed.
    f.setTask({ activeTurnId: null, latestTurnCompletedAt: f.clock.now.toISOString() });
    f.advance(3 * 24 * 60);
    await f.tick();
    expect(f.runTaskCalls).toHaveLength(1);
    expect((await f.propose([{ kind: "schedule", operation: "resume", scheduleId: record.scheduleId }])).receipts[0]).toMatchObject({ status: "rejected", reason: "pastTime" });
  });
});

describe("Tars schedule: across a restart", () => {
  test("schedules, their records and their runs are still there, and the same confirmation still creates nothing more", async () => {
    const f = fixture();
    const created = await f.confirmed({ ...CHECK_RELEASE, when: { kind: "recurring", every: 30, unit: "minutes" } }, { enable: true });
    f.advance(31);
    await f.tick();
    const before = await f.scheduler.list();
    f.close();

    // A new host process over the same file.
    const second = host(f.file, f.clock, f.state);
    cleanups.push(() => second.close());
    const after = await second.scheduler.list();
    expect(after.schedules).toHaveLength(1);
    expect(after.schedules[0]).toMatchObject({ id: created.record.scheduleId, title: "Check the release branch", enabled: true, nextRuns: before.schedules[0]!.nextRuns });
    expect(second.tars.schedules.listRecords()).toEqual([created.record]);
    expect(second.tars.schedules.listRuns()).toHaveLength(1);
    expect((await second.scheduler.confirm({ requestId: created.requestId, source: "click", enable: true })).record).toEqual(created.record);
    expect((await second.automations.list()).automations).toHaveLength(1);
    // It keeps firing on its rule after the restart.
    f.advance(31);
    second.setTask({ activeTurnId: null, latestTurnCompletedAt: f.clock.now.toISOString() });
    await second.tick();
    expect(second.runTaskCalls).toHaveLength(1);
    expect(second.tars.schedules.listRuns().filter((run) => run.status === "running")).toHaveLength(1);
  });

  test("a confirmation interrupted after the schedule was created settles on restart without creating a second one", async () => {
    const f = fixture();
    const proposal = await f.propose([CHECK_RELEASE]);
    // The process stopped between creating the schedule and settling its record.
    const id = tarsScheduleIdFor(proposal.requestId);
    f.tars.schedules.recordRequest({ requestId: proposal.requestId, source: "click", operation: "create", scheduleId: id, proposal: { messageId: proposal.message.id, actionIndex: 0 }, enable: true },
      f.clock.now.toISOString());
    await f.automations.create(userSchedule({ name: "Check the release branch", prompt: CHECK_RELEASE.request, schedule: { every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] } }), { id });
    f.close();

    const second = host(f.file, f.clock, f.state);
    cleanups.push(() => second.close());
    await second.scheduler.recover();
    expect(second.tars.schedules.getRecord(proposal.requestId)).toMatchObject({ status: "applied", scheduleId: id, summary: { enabled: true } });
    expect((await second.automations.list()).automations).toHaveLength(1);
    expect(second.receipt(proposal)).toMatchObject({ status: "applied" });
    expect((await second.scheduler.list()).schedules).toHaveLength(1);
  });

  test("an interrupted removal that already removed the schedule settles as removed, not as a refusal", async () => {
    const f = fixture();
    const { record } = await f.confirmed(CHECK_RELEASE);
    const removal = await f.propose([{ kind: "schedule", operation: "remove", scheduleId: record.scheduleId }]);
    f.tars.schedules.recordRequest({ requestId: removal.requestId, source: "click", operation: "remove", scheduleId: record.scheduleId, proposal: { messageId: removal.message.id, actionIndex: 0 } },
      f.clock.now.toISOString());
    await f.automations.remove({ id: record.scheduleId });
    await f.scheduler.recover();
    expect(f.tars.schedules.getRecord(removal.requestId)).toMatchObject({ status: "applied", operation: "remove", summary: { title: "Check the release branch" } });
    expect(f.receipt(removal)).toMatchObject({ status: "applied" });
  });
});

describe("Tars schedule: in the conversation", () => {
  test("records and scheduled runs travel in the conversation contract, and a conversation clear keeps what is still going", async () => {
    const f = fixture();
    const { record } = await f.confirmed({ ...CHECK_RELEASE, when: { kind: "recurring", every: 30, unit: "minutes" } }, { enable: true });
    f.advance(31);
    await f.tick();
    const conversation = TarsConversationSchema.parse({ settings: f.conversations.getSettings(), activity: [], messages: f.conversations.listViews(10),
      receipts: f.conversations.listViews(10).flatMap((message) => f.conversations.listReceipts(message.id)), records: [],
      schedules: f.tars.schedules.listRecords(), scheduleRuns: f.tars.schedules.listRuns() });
    expect(conversation.schedules).toEqual([record]);
    expect(conversation.scheduleRuns).toHaveLength(1);
    expect(conversation.scheduleRuns![0]).toMatchObject({ actor: "schedule", status: "running" });
    // Cleared after both happened: the settled confirmation leaves the view, the run still going stays.
    f.advance(5);
    const cleared = filterTarsConversationView(conversation, { clearedAt: f.clock.now.toISOString(), inProgress: [], keeps: { messageIds: new Set(), decisionIds: new Set() } });
    expect(cleared.schedules).toEqual([]);
    expect(cleared.scheduleRuns).toHaveLength(1);
  });

  test("the conversation a window reads carries the schedule records and the scheduled runs", async () => {
    const f = fixture();
    const { record } = await f.confirmed({ ...CHECK_RELEASE, when: { kind: "recurring", every: 30, unit: "minutes" } }, { enable: true });
    f.advance(31);
    await f.tick();
    // Main's conversation service over the same file; only its reads are used here.
    const service = createTarsConversationService({ conversations: f.conversations, responsibilities: f.tars, coordinator: {} as never,
      context: async () => { throw new Error("not used"); }, applyDecision: async () => [] });
    const conversation = service.getConversation();
    expect(conversation.schedules).toEqual([record]);
    expect(conversation.scheduleRuns).toMatchObject([{ actor: "schedule", status: "running", scheduleId: record.scheduleId, taskId: "task-1" }]);
    // The proposal's receipt settled with its record.
    expect(conversation.receipts).toMatchObject([{ status: "applied", action: { kind: "schedule", operation: "create" }, responsibilityId: null }]);
  });

  test("a proposal that still waits for its card survives a conversation clear", async () => {
    const f = fixture();
    const proposal = await f.propose([CHECK_RELEASE]);
    const { tarsClearKeeps } = await import("../src/lib/tars/clear-view");
    const keeps = tarsClearKeeps({ decisions: [], receipts: proposal.receipts });
    expect(keeps.messageIds.has(proposal.message.id)).toBe(true);
  });
});
