import { describe, expect, test } from "bun:test";
import { activeMsAt, projectAgentRunActiveTime } from "../src/lib/agent-runs/active-time";
import { AgentRunEventSchema, type AgentRun, type AgentRunEvent, type AgentRunEventKind } from "../src/lib/agent-runs/domain";
import type { AgentRunReport } from "../src/lib/agent-runs/report";
import { describeReportTitle, reportDurationMs } from "../src/lib/agent-runs/report-markdown";

const START = Date.parse("2026-11-03T09:00:00.000Z");
const MIN = 60_000;
const at = (minutes: number) => new Date(START + minutes * MIN).toISOString();

/** A run's clock events at minutes after its start, in the order given. */
function events(...entries: Array<[AgentRunEventKind, number, Record<string, unknown>?]>): AgentRunEvent[] {
  return entries.map(([kind, minutes, detail], index) =>
    AgentRunEventSchema.parse({
      id: `event-${index + 1}`,
      agentRunId: "agent-run-1",
      sequence: index + 1,
      kind,
      idempotencyKey: null,
      detail: detail ?? {},
      createdAt: at(minutes),
    }));
}

function run(state: AgentRun["state"], updatedMinutes: number): Pick<AgentRun, "createdAt" | "updatedAt" | "state"> {
  return { createdAt: at(0), updatedAt: at(updatedMinutes), state };
}

describe("agent run active time", () => {
  test("a running run counts from its start, still counting", () => {
    const time = projectAgentRunActiveTime(run("running", 0), events(["agent-run-started", 0]));
    expect(time).toEqual({ activeMs: 0, activeSince: at(0) });
    expect(activeMsAt(time, START + 7 * MIN)).toBe(7 * MIN);
  });

  test("a pause stops the clock and a resume starts it again", () => {
    const paused = projectAgentRunActiveTime(run("paused", 10), events(["agent-run-started", 0], ["paused", 10]));
    expect(paused).toEqual({ activeMs: 10 * MIN, activeSince: null });
    // Paused for 30 minutes: the time does not move however late it is read.
    expect(activeMsAt(paused, START + 40 * MIN)).toBe(10 * MIN);
    const resumed = projectAgentRunActiveTime(run("running", 40), events(["agent-run-started", 0], ["paused", 10], ["resumed", 40]));
    expect(resumed).toEqual({ activeMs: 10 * MIN, activeSince: at(40) });
    expect(activeMsAt(resumed, START + 45 * MIN)).toBe(15 * MIN);
  });

  test("a second pause reason while paused does not count the pause twice", () => {
    const time = projectAgentRunActiveTime(
      run("running", 50),
      events(["agent-run-started", 0], ["paused", 10, { reason: "usage-limit" }], ["paused", 20, { reason: "paused-by-user" }], ["resumed", 50]),
    );
    expect(activeMsAt(time, START + 60 * MIN)).toBe(20 * MIN);
  });

  test("waiting on the user stops the clock until the wait ends", () => {
    const waiting = projectAgentRunActiveTime(
      run("running", 5),
      events(["agent-run-started", 0], ["user-wait-started", 5, { reason: "approval" }]),
    );
    expect(waiting).toEqual({ activeMs: 5 * MIN, activeSince: null });
    const answered = projectAgentRunActiveTime(
      run("running", 25),
      events(["agent-run-started", 0], ["user-wait-started", 5, { reason: "question" }], ["user-wait-ended", 25]),
    );
    expect(activeMsAt(answered, START + 30 * MIN)).toBe(10 * MIN);
  });

  test("a wait that spans a pause counts neither", () => {
    const time = projectAgentRunActiveTime(
      run("running", 40),
      events(
        ["agent-run-started", 0],
        ["user-wait-started", 5, { reason: "sign-off" }],
        ["paused", 10],
        ["resumed", 20],
        // The sign-off was still open after the resume.
        ["user-wait-ended", 40],
      ),
    );
    expect(activeMsAt(time, START + 50 * MIN)).toBe(15 * MIN);
  });

  test("a completed run stops at its end and does not count on", () => {
    const time = projectAgentRunActiveTime(
      run("completed", 35),
      events(["agent-run-started", 0], ["paused", 10], ["resumed", 20], ["agent-run-ended", 35, { outcome: "completed" }]),
    );
    expect(time).toEqual({ activeMs: 25 * MIN, activeSince: null });
    expect(activeMsAt(time, START + 120 * MIN)).toBe(25 * MIN);
  });

  test("an ended run whose end event was not read stops at its last change", () => {
    const time = projectAgentRunActiveTime(run("cancelled", 12), events(["agent-run-started", 0]));
    expect(time).toEqual({ activeMs: 12 * MIN, activeSince: null });
  });

  test("a clean host restart leaves out the time the host was stopped", () => {
    const time = projectAgentRunActiveTime(
      run("running", 10),
      events(["agent-run-started", 0], ["host-stopped", 10], ["host-started", 70]),
    );
    expect(time).toEqual({ activeMs: 10 * MIN, activeSince: at(70) });
    expect(activeMsAt(time, START + 75 * MIN)).toBe(15 * MIN);
  });

  test("after a crash the clock stops where the host was last seen alive", () => {
    const time = projectAgentRunActiveTime(
      run("running", 8),
      events(["agent-run-started", 0], ["host-started", 600, { lastSeenAt: at(8) }]),
    );
    expect(time).toEqual({ activeMs: 8 * MIN, activeSince: at(600) });
  });

  test("a restart while paused keeps the run paused", () => {
    const time = projectAgentRunActiveTime(
      run("running", 100),
      events(["agent-run-started", 0], ["paused", 10], ["host-stopped", 20], ["host-started", 60], ["resumed", 100]),
    );
    expect(activeMsAt(time, START + 105 * MIN)).toBe(15 * MIN);
  });

  test("a run prepared for a delegation starts counting at its activation", () => {
    const time = projectAgentRunActiveTime(
      run("running", 3),
      events(["agent-run-started", 0, { delegation: { executionId: "exec-1" } }], ["resumed", 3], ["resumed", 3, { delegationActivated: true }]),
    );
    expect(time).toEqual({ activeMs: 0, activeSince: at(3) });
  });

  test("events are read in sequence order and other kinds are ignored", () => {
    const [started, paused, resumed] = events(["agent-run-started", 0], ["paused", 10], ["resumed", 20]);
    const noise = AgentRunEventSchema.parse({ ...paused!, id: "noise", sequence: 4, kind: "nudge", createdAt: at(25) });
    const time = projectAgentRunActiveTime(run("running", 20), [resumed!, noise, started!, paused!]);
    expect(activeMsAt(time, START + 30 * MIN)).toBe(20 * MIN);
  });
});

describe("an ended run's report reads its active time", () => {
  const report = { outcome: "completed", turnCount: 5, startedAt: at(0), endedAt: at(40) } as const;

  test("the title and the figure say active when the host reports it", () => {
    const active = { ...report, activeMs: 22 * MIN } as unknown as AgentRunReport;
    expect(reportDurationMs(active)).toBe(22 * MIN);
    expect(describeReportTitle(active)).toBe("Run complete · 22m active · 5 turns");
    // An older host: the span from start to end, worded as before.
    const older = report as unknown as AgentRunReport;
    expect(reportDurationMs(older)).toBe(40 * MIN);
    expect(describeReportTitle(older)).toBe("Run complete · 40m · 5 turns");
  });
});
