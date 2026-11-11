import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildTarsPlannerPrompt, parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { TarsActionReceiptSchema, TarsDecisionSchema, type TarsMessage } from "../src/lib/tars/conversation";
import {
  projectTarsScheduleProposals, resolveTarsScheduleRule, TarsScheduleActionSchema, TarsScheduleConfirmInputSchema, tarsPlannerSchedules,
  tarsScheduleContentKey, tarsScheduleNextRuns, tarsScheduleProposalRequestId, parseTarsScheduleProposalRequestId, TarsScheduleToggleInputSchema,
  type TarsScheduleList, type TarsScheduleRecord,
} from "../src/lib/tars/schedules";
import { TarsStore } from "../electron/persistence/tars-store";
import { Database } from "bun:sqlite";
import { SETTINGS, testContext } from "./tars-test-context";

/**
 * The pure half of Tars's schedules: the action contract, how a model-written
 * "when" becomes a rule of the Schedules service, and what the planner is
 * told. No store and no service; the time zone cases run in a process of
 * their own zone, the zone the Schedules service resolves local rules in.
 */

const CREATE = { kind: "schedule", operation: "create", title: "Check the release branch", request: "Check the release branch.", workspaceId: "source",
  when: { kind: "recurring", every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] } } as const;

describe("schedule action contract", () => {
  test("each operation takes exactly the fields it needs", () => {
    expect(TarsScheduleActionSchema.safeParse(CREATE).success).toBe(true);
    expect(TarsScheduleActionSchema.safeParse({ kind: "schedule", operation: "list" }).success).toBe(true);
    expect(TarsScheduleActionSchema.safeParse({ kind: "schedule", operation: "pause", scheduleId: "tars-1" }).success).toBe(true);
    expect(TarsScheduleActionSchema.safeParse({ kind: "schedule", operation: "update", scheduleId: "tars-1", title: "Renamed" }).success).toBe(true);
    for (const invalid of [
      { ...CREATE, workspaceId: undefined }, { ...CREATE, when: undefined }, { ...CREATE, request: " " }, { ...CREATE, scheduleId: "tars-1" },
      { kind: "schedule", operation: "list", scheduleId: "tars-1" }, { kind: "schedule", operation: "pause" },
      { kind: "schedule", operation: "remove", scheduleId: "tars-1", title: "Extra" }, { kind: "schedule", operation: "update", scheduleId: "tars-1" },
      // Nothing the host derives may ride in on the model's action.
      { ...CREATE, repositoryPath: "/tmp/elsewhere" }, { ...CREATE, enabled: true }, { ...CREATE, trustPolicy: "unattended" },
      { ...CREATE, when: { ...CREATE.when, timezone: "UTC" } },
    ]) expect(TarsScheduleActionSchema.safeParse(invalid).success).toBe(false);
  });

  test("a model's nulls for optional fields read as absent, and an overlong title is cut, not fatal", () => {
    const parsed = TarsScheduleActionSchema.parse({ ...CREATE, scheduleId: null, title: `${"A".repeat(200)}`, when: { kind: "recurring", every: 1, unit: "days", at: null, weekdays: null } });
    expect(parsed.scheduleId).toBeUndefined();
    expect(parsed.title).toHaveLength(120);
    expect(parsed.when).toEqual({ kind: "recurring", every: 1, unit: "days" });
  });

  test("a decision may carry schedule actions, and its receipt waits as proposed with no responsibility", () => {
    const decision = parseTarsDecisionOutput(JSON.stringify({ reply: "Confirm the card.", actions: [CREATE, { kind: "schedule", operation: "list" }] }));
    expect(decision.actions.map((action) => action.kind)).toEqual(["schedule", "schedule"]);
    expect(() => parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [{ ...CREATE, enabled: true }] }))).toThrow();
    const base = { messageId: "m1", actionIndex: 0, requestHash: "a".repeat(64), action: TarsDecisionSchema.parse({ reply: "", actions: [CREATE] }).actions[0],
      error: null, reason: null, revision: 1, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" };
    expect(TarsActionReceiptSchema.safeParse({ ...base, status: "proposed", responsibilityId: null }).success).toBe(true);
    expect(TarsActionReceiptSchema.safeParse({ ...base, status: "applied", responsibilityId: null }).success).toBe(true);
    // A schedule belongs to no responsibility, so an applied receipt may not name one.
    expect(TarsActionReceiptSchema.safeParse({ ...base, status: "applied", responsibilityId: "work-1" }).success).toBe(false);
    expect(TarsActionReceiptSchema.safeParse({ ...base, status: "rejected", responsibilityId: null, error: "Past.", reason: "pastTime" }).success).toBe(true);
    // A refusal code of another action kind is not a schedule's.
    expect(TarsActionReceiptSchema.safeParse({ ...base, status: "rejected", responsibilityId: null, error: "No.", reason: "agentUnknown" }).success).toBe(false);
    // Listing changes nothing, so it never waits as proposed.
    const list = { ...base, action: { kind: "schedule", operation: "list" } };
    expect(TarsActionReceiptSchema.safeParse({ ...list, status: "proposed", responsibilityId: null }).success).toBe(false);
    expect(TarsActionReceiptSchema.safeParse({ ...list, status: "applied", responsibilityId: null }).success).toBe(true);
  });

  test("a confirmation names its proposal and one choice; a switch names its schedule", () => {
    const requestId = tarsScheduleProposalRequestId("message-1", 3);
    expect(parseTarsScheduleProposalRequestId(requestId)).toEqual({ messageId: "message-1", actionIndex: 3 });
    expect(parseTarsScheduleProposalRequestId("clear:message-1:3")).toBeNull();
    expect(TarsScheduleConfirmInputSchema.safeParse({ requestId, source: "click", enable: true }).success).toBe(true);
    for (const invalid of [{ requestId: "anything", source: "click" }, { requestId, source: "words" }, { requestId, source: "click", scheduleId: "tars-1" },
      { requestId, source: "click", when: CREATE.when }]) expect(TarsScheduleConfirmInputSchema.safeParse(invalid).success).toBe(false);
    expect(TarsScheduleToggleInputSchema.safeParse({ requestId: "schedule-switch:abc", scheduleId: "tars-1", paused: true, source: "click" }).success).toBe(true);
    expect(TarsScheduleToggleInputSchema.safeParse({ requestId, scheduleId: "tars-1", paused: true, source: "click" }).success).toBe(false);
  });

  test("proposals show as a waiting card or their record; a refused proposal and a list stay receipt lines", () => {
    const receipt = (actionIndex: number, status: string, action: unknown = CREATE) => ({ messageId: "m1", actionIndex, status, action: action as { kind: string } });
    const record = { requestId: tarsScheduleProposalRequestId("m1", 1) } as TarsScheduleRecord;
    const views = projectTarsScheduleProposals([receipt(0, "proposed"), receipt(1, "applied"), receipt(2, "rejected"), receipt(3, "applied", { kind: "schedule", operation: "list" }),
      receipt(4, "proposed", { kind: "clear", scopes: ["done"] })], [record]);
    expect(views.map((view) => [view.actionIndex, view.state])).toEqual([[0, "waiting"], [1, "settled"]]);
    expect(views[1]!.record).toBe(record);
  });
});

describe("a model-written when becomes a rule of the Schedules service", () => {
  const now = new Date(2026, 10, 10, 8, 0);
  test("recurring rules normalize the unit and the weekdays", () => {
    expect(resolveTarsScheduleRule({ kind: "recurring", every: 1, unit: "Week", at: { hour: 9, minute: 0 }, weekdays: [5, 1, 1, 3] }, now))
      .toEqual({ ok: true, rule: { kind: "recurring", schedule: { every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 3, 5] } } });
    expect(resolveTarsScheduleRule({ kind: "recurring", every: 30, unit: "minutes" }, now)).toEqual({ ok: true, rule: { kind: "recurring", schedule: { every: 30, unit: "minutes" } } });
    // The service's own minimum, one minute, is admitted.
    expect(resolveTarsScheduleRule({ kind: "recurring", every: 1, unit: "minute" }, now).ok).toBe(true);
    expect(resolveTarsScheduleRule({ kind: "recurring", every: 1000, unit: "days" }, now)).toMatchObject({ ok: false, reason: "invalidRule" });
    expect(resolveTarsScheduleRule({ kind: "recurring", every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [7] }, now)).toMatchObject({ ok: false, reason: "invalidRule" });
  });

  test("a one-time run is a local wall-clock time saved as a UTC instant; an instant with an offset is taken as written", () => {
    expect(resolveTarsScheduleRule({ kind: "once", at: "2026-11-11T15:00" }, now)).toEqual({ ok: true, rule: { kind: "once", runAt: new Date(2026, 10, 11, 15, 0).toISOString() } });
    expect(resolveTarsScheduleRule({ kind: "once", at: "2026-11-11 15:00:00" }, now)).toEqual({ ok: true, rule: { kind: "once", runAt: new Date(2026, 10, 11, 15, 0).toISOString() } });
    expect(resolveTarsScheduleRule({ kind: "once", at: "2027-01-01T00:00:00Z" }, now)).toEqual({ ok: true, rule: { kind: "once", runAt: "2027-01-01T00:00:00.000Z" } });
    expect(resolveTarsScheduleRule({ kind: "once", at: "tomorrow at 3" }, now)).toMatchObject({ ok: false, reason: "invalidTime" });
    expect(resolveTarsScheduleRule({ kind: "once", at: "2026-13-01T09:00" }, now)).toMatchObject({ ok: false, reason: "invalidTime" });
  });

  test("the next runs of a rule and its content key", () => {
    const rule = { kind: "recurring" as const, schedule: { every: 1, unit: "days" as const, at: { hour: 9, minute: 0 } } };
    expect(tarsScheduleNextRuns(rule, now)).toEqual([new Date(2026, 10, 10, 9, 0).toISOString(), new Date(2026, 10, 11, 9, 0).toISOString()]);
    const once = { kind: "once" as const, runAt: new Date(2026, 10, 11, 15, 0).toISOString() };
    expect(tarsScheduleNextRuns(once, now)).toEqual([once.runAt]);
    expect(tarsScheduleNextRuns(once, new Date(2026, 10, 12))).toEqual([]);
    const content = { title: "Check", request: "Check it.", workspaceId: "source", trustPolicy: "review-required", rule: { kind: "recurring" as const, schedule: { every: 1, unit: "weeks" as const, at: { hour: 9, minute: 0 }, weekdays: [1, 2] } } };
    // The same days in another order, or a single weekday written either way, are the same content.
    expect(tarsScheduleContentKey({ ...content, rule: { kind: "recurring", schedule: { ...content.rule.schedule, weekdays: [2, 1] } } })).toBe(tarsScheduleContentKey(content));
    expect(tarsScheduleContentKey({ ...content, request: "Check it twice." })).not.toBe(tarsScheduleContentKey(content));
    expect(tarsScheduleContentKey({ ...content, rule: once })).not.toBe(tarsScheduleContentKey(content));
    // A schedule made unattended is no longer what Tars saved.
    expect(tarsScheduleContentKey({ ...content, trustPolicy: "unattended" })).not.toBe(tarsScheduleContentKey(content));
  });
});

/**
 * Runs `body` in a fresh process whose zone is `zone` and returns what it
 * returns. The Schedules service reads local rules in the process zone, and a
 * zone changed inside a shared test process would leak into other test files,
 * so each zone gets its own process.
 */
function inZone<T>(zone: string, body: string): T {
  const source = `
    import { resolveTarsScheduleRule, tarsScheduleNextRuns, tarsPlannerClock } from "./src/lib/tars/schedules";
    import { computeNextAutomationRunAt, resolveNextAutomationRunAt } from "./src/lib/automations";
    const caught = (run) => { try { return run(); } catch (error) { return { threw: error.message }; } };
    console.log(JSON.stringify((() => { ${body} })()));`;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), env: { ...process.env, TZ: zone }, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString()) as T;
}

describe("time zones and daylight saving", () => {
  test("the planner's clock is the user's local wall-clock time with the zone's name", () => {
    expect(inZone("America/New_York", `return { noon: new Date(2026, 0, 15, 12, 0).toISOString(), clock: tarsPlannerClock(new Date("2026-11-10T13:05:00.000Z")) };`))
      .toEqual({ noon: "2026-01-15T17:00:00.000Z", clock: { utc: "2026-11-10T13:05:00.000Z", local: "2026-11-10T08:05", timezone: "America/New_York", weekday: 2 } });
  });

  test("a daily 09:00 rule keeps 09:00 local across the spring change: the UTC instant moves by an hour", () => {
    // Saturday 7 March 2026, 12:00 EST. Clocks spring forward on Sunday 8 March at 02:00.
    const result = inZone<{ runs: string[]; dayBefore: string }>("America/New_York", `
      const rule = resolveTarsScheduleRule({ kind: "recurring", every: 1, unit: "days", at: { hour: 9, minute: 0 } }, new Date("2026-03-07T17:00:00.000Z"));
      return { runs: tarsScheduleNextRuns(rule.rule, new Date("2026-03-07T17:00:00.000Z"), 3),
        dayBefore: computeNextAutomationRunAt({ schedule: rule.rule.schedule, after: "2026-03-06T17:00:00.000Z" }) };`);
    expect(result.runs).toEqual([
      "2026-03-08T13:00:00.000Z", // Sunday 09:00 EDT (UTC-4)
      "2026-03-09T13:00:00.000Z",
      "2026-03-10T13:00:00.000Z",
    ]);
    // The day before the change it was 09:00 EST (UTC-5).
    expect(result.dayBefore).toBe("2026-03-07T14:00:00.000Z");
  });

  test("a weekday 09:00 rule keeps 09:00 local across the autumn change", () => {
    // Friday 30 October 2026, 10:00 EDT. Clocks fall back on Sunday 1 November at 02:00.
    expect(inZone("America/New_York", `
      const rule = resolveTarsScheduleRule({ kind: "recurring", every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] }, new Date("2026-10-30T14:00:00.000Z"));
      return tarsScheduleNextRuns(rule.rule, new Date("2026-10-30T14:00:00.000Z"));`)).toEqual([
      "2026-11-02T14:00:00.000Z", // Monday 09:00 EST (UTC-5); Friday's 09:00 EDT was 13:00 UTC
      "2026-11-03T14:00:00.000Z",
    ]);
  });

  test("a one-time local time inside the spring jump does not exist and is refused, not moved", () => {
    const result = inZone<{ gap: unknown; after: unknown; repeated: { ok: boolean; rule: { runAt: string } } }>("America/New_York", `
      const before = new Date("2026-03-07T17:00:00.000Z");
      return { gap: resolveTarsScheduleRule({ kind: "once", at: "2026-03-08T02:30" }, before), after: resolveTarsScheduleRule({ kind: "once", at: "2026-03-08T03:30" }, before),
        repeated: resolveTarsScheduleRule({ kind: "once", at: "2026-11-01T01:30" }, new Date("2026-10-30T14:00:00.000Z")) };`);
    expect(result.gap).toMatchObject({ ok: false, reason: "invalidTime" });
    expect(result.after).toEqual({ ok: true, rule: { kind: "once", runAt: "2026-03-08T07:30:00.000Z" } });
    // The hour that happens twice in autumn is taken at one of its two instants, both of which are that wall-clock time.
    expect(result.repeated.ok).toBe(true);
    expect(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]).toContain(result.repeated.rule.runAt);
  });

  test("a one-time instant is fixed in UTC: another zone later does not move it, while a repeating local rule follows the computer", () => {
    expect(inZone("America/New_York", `return resolveTarsScheduleRule({ kind: "once", at: "2026-11-11T15:00" }, new Date("2026-11-10T13:00:00.000Z"));`))
      .toEqual({ ok: true, rule: { kind: "once", runAt: "2026-11-11T20:00:00.000Z" } });
    // The same saved schedules read on a computer that is now in Seoul.
    expect(inZone("Asia/Seoul", `return {
      once: resolveNextAutomationRunAt({ schedule: { every: 1, unit: "days" }, runOnceAt: "2026-11-11T20:00:00.000Z", after: "2026-11-10T13:00:00.000Z" }),
      passed: caught(() => resolveNextAutomationRunAt({ schedule: { every: 1, unit: "days" }, runOnceAt: "2026-11-11T20:00:00.000Z", after: "2026-11-11T20:00:00.000Z" })),
      daily: computeNextAutomationRunAt({ schedule: { every: 1, unit: "days", at: { hour: 9, minute: 0 } }, after: "2026-11-10T13:00:00.000Z" }) };`))
      .toEqual({ once: "2026-11-11T20:00:00.000Z", passed: { threw: expect.stringContaining("already passed") }, daily: "2026-11-11T00:00:00.000Z" });
  });
});

describe("what the planner is told about schedules", () => {
  const message = { ...SETTINGS, id: "m1", requestId: "r1", text: "Every weekday at 9 check the release branch.", state: "reasoning", revision: 2, reply: null, error: null, decision: null,
    createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" } as TarsMessage;
  const list: TarsScheduleList = { timezone: "Asia/Seoul", omitted: 0, schedules: [{ id: "tars-1", title: "Check the release branch", request: "R".repeat(500),
    workspace: { id: "source", name: "Source", repositoryName: "Project" }, rule: { kind: "recurring", schedule: { every: 1, unit: "days", at: { hour: 9, minute: 0 } } },
    timezone: "Asia/Seoul", enabled: true, nextRuns: ["2026-11-11T00:00:00.000Z"], lastRun: null, editedElsewhere: true, createdAt: "2026-11-10T00:00:00.000Z" }] };

  test("the prompt names the action, the user's local clock and the schedules Tars created", () => {
    const database = new Database(":memory:");
    try {
      const context = { ...testContext(new TarsStore(database)), schedules: list,
        clock: { utc: "2026-11-10T00:00:00.000Z", local: "2026-11-10T09:00", timezone: "Asia/Seoul", weekday: 2 } };
      const prompt = buildTarsPlannerPrompt(message, context, []);
      expect(prompt).toContain("{kind:'schedule',operation:'create'|'update'|'pause'|'resume'|'remove'|'list'");
      expect(prompt).toContain("never convert to UTC");
      expect(prompt).toContain("Never propose a schedule action on your own initiative");
      expect(prompt).toContain("Never propose publish or any schedule action.");
      const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)) as { clock: unknown; schedules: Array<Record<string, unknown>>; schedulesAvailable: boolean };
      expect(data.clock).toEqual(context.clock);
      expect(data.schedulesAvailable).toBe(true);
      expect(data.schedules).toEqual([{ id: "tars-1", title: "Check the release branch", requestExcerpt: "R".repeat(300), workspaceId: "source",
        when: list.schedules[0]!.rule, enabled: true, nextRuns: ["2026-11-11T00:00:00.000Z"], lastRun: null, editedElsewhere: true }]);
    } finally { database.close(); }
  });

  test("schedules that could not be read are said to be unreadable, never empty", () => {
    expect(tarsPlannerSchedules(null)).toEqual({ schedules: [], omitted: 0, available: false });
    expect(tarsPlannerSchedules({ timezone: "UTC", schedules: [], omitted: 2 })).toEqual({ schedules: [], omitted: 2, available: true });
  });
});
