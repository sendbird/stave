import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { AgentRunBarView } from "../src/components/agent-runs/AgentRunBar";
import { FleetAgentRunStripView } from "../src/components/agent-runs/FleetAgentRunStrip";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { describeAgentRunStatus } from "../src/lib/agent-runs/agent-run-status";
import type { AgentRunEventWait } from "../src/lib/agent-runs/event-wait";
import {
  describeDelegatedWait,
  describeEventWaitCheck,
  describeEventWaitSince,
  describeRunWaitLiveness,
  formatWaitDuration,
} from "../src/lib/agent-runs/wait-liveness";
import { fromDelegatedTask, type DelegationExchange } from "../src/lib/delegation/exchange";
import {
  describeSubagentState,
  describeSubagentSummary,
  planSubagentLine,
  subagentCurrentStep,
  subagentLineState,
} from "../src/lib/delegation/subagent-summary";
import type { DelegatedTaskSummary } from "../src/lib/runs/delegated-task";
import { applyRuntimeLocale } from "@/i18n/runtime";

const START = new Date("2026-10-01T09:00:00.000Z");
const NOW = START.getTime() + 4 * 60_000;
const MINUTE = 60_000;
const runs = buildAgentRunFixtures(START);
const baseWait = runs.eventWait.agentRun.eventWait!;

afterEach(() => applyRuntimeLocale("en"));

function withWait(patch: Partial<AgentRunEventWait>, extra: Partial<AgentRunDetail> = {}): AgentRunDetail {
  return { ...runs.eventWait, ...extra, agentRun: { ...runs.eventWait.agentRun, eventWait: { ...baseWait, ...patch } } };
}

function delegate(
  id: string,
  outcome: DelegationExchange["outcome"],
  timing: Partial<DelegationExchange["timing"]> = {},
): DelegationExchange {
  return {
    id, kind: "delegated-task", title: id, identity: { role: "Agent" }, ask: "",
    outcome, timing: { startedAt: null, stages: [], ...timing }, actions: [], setup: {}, ref: { delegationKey: id },
  };
}

const watch = (patch: Partial<NonNullable<AgentRunEventWait["watch"]>> = {}): NonNullable<AgentRunEventWait["watch"]> => ({
  pullRequest: null,
  lastCheckedAt: null,
  lastSeen: null,
  consecutiveReadFailures: 0,
  lastReadError: null,
  pendingSince: null,
  ...patch,
});

const iso = (ms: number) => new Date(ms).toISOString();

const bar = (detail: AgentRunDetail, subagents: readonly DelegationExchange[] | null = null, nowPhrase: string | null = null) =>
  renderToStaticMarkup(
    createElement(AgentRunBarView, {
      detail,
      nowPhrase,
      subagents,
      now: NOW,
      reducedMotion: false,
      agentActions: { onStop: () => {}, onTakeControl: () => {} },
      actions: { onOpenPanel: () => {} },
    }),
  );

describe("the waited count", () => {
  test("reads in minutes, from when the run last settled, and names that moment", () => {
    expect(formatWaitDuration(45_000)).toBe("<1m");
    expect(formatWaitDuration(6 * MINUTE)).toBe("6m");
    const since = Date.parse(baseWait.waitingSince!);
    const described = describeEventWaitSince(baseWait, since + 30_000);
    expect(described.text).toBe("<1m");
    expect(described.title).toStartWith("Waiting since ");
    applyRuntimeLocale("ko");
    expect(formatWaitDuration(45_000)).toBe("1분 미만");
  });

  test("the status carries the active wait; a usage wait carries none", () => {
    expect(describeAgentRunStatus(runs.eventWait).eventWait?.id).toBe("wait-preview");
    expect(describeAgentRunStatus(runs.waiting).eventWait).toBeNull();
    expect(describeAgentRunStatus(runs.working).eventWait).toBeNull();
  });
});

describe("the last look at the wait", () => {
  test("a pull request wait names its last read", () => {
    expect(describeEventWaitCheck(baseWait, NOW)).toBeNull();
    expect(describeEventWaitCheck({ ...baseWait, watch: watch({ lastCheckedAt: iso(NOW - 20_000) }) }, NOW)).toEqual({ text: "Checked just now", tone: "muted" });
    expect(describeEventWaitCheck({ ...baseWait, watch: watch({ lastCheckedAt: iso(NOW - 3 * MINUTE) }) }, NOW)?.text).toBe("Checked 3m ago");
    applyRuntimeLocale("ko");
    expect(describeEventWaitCheck({ ...baseWait, watch: watch({ lastCheckedAt: iso(NOW - 3 * MINUTE) }) }, NOW)?.text).toBe("3분 전 확인");
  });

  test("failing reads warn and say when the next try comes, from the backoff", () => {
    // Two failures: the next read is 2m × 2² = 8m after the last one.
    const failing = { ...baseWait, watch: watch({ lastCheckedAt: iso(NOW - MINUTE), consecutiveReadFailures: 2 }) };
    expect(describeEventWaitCheck(failing, NOW)).toEqual({ text: "Couldn't read the PR 2 times · next try in 7m", tone: "warning" });
    const due = { ...baseWait, watch: watch({ lastCheckedAt: iso(NOW - 10 * MINUTE), consecutiveReadFailures: 1 }) };
    expect(describeEventWaitCheck(due, NOW)).toEqual({ text: "Couldn't read the PR · trying again", tone: "warning" });
  });

  test("any wait reads the host's last look; an old look warns that the host stopped looking", () => {
    const delegated = { ...baseWait, kind: "delegated_completion" as const };
    expect(describeEventWaitCheck(delegated, NOW)).toBeNull();
    expect(describeEventWaitCheck(delegated, NOW, iso(NOW - 5_000))).toEqual({ text: "Checked just now", tone: "muted" });
    expect(describeEventWaitCheck(delegated, NOW, iso(NOW - 2 * MINUTE))?.text).toBe("Checked 2m ago");
    expect(describeEventWaitCheck(delegated, NOW, iso(NOW - 5 * MINUTE))).toEqual({ text: "Not checked for 5m", tone: "warning" });
    // A stale host outranks the pull request's own last read.
    expect(describeEventWaitCheck({ ...baseWait, watch: watch({ lastCheckedAt: iso(NOW - MINUTE) }) }, NOW, iso(NOW - 10 * MINUTE))?.tone).toBe("warning");
  });
});

describe("what the delegates say about the wait", () => {
  const delegatedWait = { ...baseWait, kind: "delegated_completion" as const, target: null, since: iso(NOW - 10 * MINUTE) };

  test("a delegate that needs the user is said whatever the run waits for", () => {
    expect(describeDelegatedWait({ wait: null, rows: [delegate("Writer", { status: "running", needsUser: true })], now: NOW }))
      .toEqual({ text: "Writer needs you", tone: "warning" });
    expect(describeDelegatedWait({ wait: baseWait, rows: [delegate("A", { status: "running", needsUser: true }), delegate("B", { status: "running", needsUser: true })], now: NOW })?.text)
      .toBe("A, B need you");
  });

  const PARENT = "parent";
  const ledger = (key: string, patch: Partial<DelegatedTaskSummary> = {}): DelegatedTaskSummary => ({
    runId: `child-task:${PARENT}:${key}`, stepId: `child-task:${PARENT}:${key}:turn`, parentTaskId: PARENT, delegationKey: key,
    delegatedTaskId: `task-${key}`, delegatedWorkspaceId: "ws-1", delegatedTurnId: null, providerId: "codex",
    requestedModel: null, requestedEffort: null, lifecycle: "isolated", phase: "completed", reason: null, attempt: 0,
    createdAt: iso(NOW - 30 * MINUTE), updatedAt: iso(NOW - 2 * MINUTE), completedAt: iso(NOW - 2 * MINUTE),
    ...patch,
  } as DelegatedTaskSummary);
  const resumeNote = (wait: AgentRunEventWait, children: DelegatedTaskSummary[], now = NOW) =>
    describeDelegatedWait({ wait, rows: [delegate("x", { status: "returned" })], children, parentTaskId: PARENT, now });
  const consumedKey = (key: string) => `completion:child-task:${PARENT}:${key}:child-task:${PARENT}:${key}:turn:0:completed`;

  test("work that should have woken the run a while ago warns, by the host's own rule", () => {
    const settled = { ...delegatedWait, waitingSince: iso(NOW - 10 * MINUTE) };
    expect(resumeNote(settled, [ledger("review")])?.text).toBe("Delegated work finished 2m ago, but the run has not resumed");
    // Within the grace the run is expected to be resuming.
    expect(resumeNote(settled, [ledger("review", { completedAt: iso(NOW - 30_000) })])).toBeNull();
    // Any one delegate ending wakes an untargeted wait, so another still running does not hide it.
    expect(resumeNote(settled, [ledger("review"), ledger("docs", { phase: "running", completedAt: null })])?.tone).toBe("warning");
    // Work that ended before the wait began does not count.
    expect(resumeNote({ ...settled, since: iso(NOW - MINUTE) }, [ledger("review")])).toBeNull();
    // No ledger rows (an older listing): nothing to judge.
    expect(resumeNote(settled, [])).toBeNull();
    // Other kinds of wait never read delegate endings.
    expect(resumeNote(baseWait, [ledger("review")])).toBeNull();
  });

  test("a completion the host already delivered never warns, whatever the wait now targets", () => {
    const resettled = { ...delegatedWait, waitingSince: iso(NOW - 3 * MINUTE), consumedKeys: [consumedKey("review")] };
    expect(resumeNote(resettled, [ledger("review", { completedAt: iso(NOW - 5 * MINUTE) })], NOW + 30 * MINUTE)).toBeNull();
    // Re-registered on the very delegate it already woke on: still delivered, still quiet.
    expect(resumeNote({ ...resettled, target: "review" }, [ledger("review", { completedAt: iso(NOW - 5 * MINUTE) })], NOW + 30 * MINUTE)).toBeNull();
  });

  test("work that ended while a turn ran, undelivered, should wake the run at its next settle", () => {
    const settled = { ...delegatedWait, since: iso(NOW - 10 * MINUTE), waitingSince: iso(NOW - 3 * MINUTE) };
    expect(resumeNote(settled, [ledger("review", { completedAt: iso(NOW - 5 * MINUTE) })])?.text).toContain("3m ago");
  });

  test("work the run's rows leave out (started before the run) still counts", () => {
    const settled = { ...delegatedWait, waitingSince: iso(NOW - 10 * MINUTE) };
    expect(describeDelegatedWait({ wait: settled, rows: [], children: [ledger("review")], parentTaskId: PARENT, now: NOW })?.tone).toBe("warning");
    const liveness = describeRunWaitLiveness({ eventWait: settled, delegates: { rows: [], children: [ledger("review")], parentTaskId: PARENT }, now: NOW });
    expect(liveness.notes[0]?.text).toContain("has not resumed");
    const html = bar(withWait({ kind: "delegated_completion", target: null, waitingSince: iso(NOW - 10 * MINUTE), since: iso(NOW - 20 * MINUTE) }), []);
    expect(html).not.toContain("has not resumed");
    const withLedger = renderToStaticMarkup(createElement(AgentRunBarView, {
      detail: withWait({ kind: "delegated_completion", target: null, waitingSince: iso(NOW - 10 * MINUTE), since: iso(NOW - 20 * MINUTE) }),
      nowPhrase: null, subagents: [], delegatedChildren: [ledger("review", { parentTaskId: runs.eventWait.agentRun.leadTaskId, runId: `child-task:${runs.eventWait.agentRun.leadTaskId}:review`, stepId: `child-task:${runs.eventWait.agentRun.leadTaskId}:review:turn` })],
      now: NOW, reducedMotion: false, actions: { onOpenPanel: () => {} },
    }));
    expect(withLedger).toContain("Delegated work finished 2m ago, but the run has not resumed");
  });

  test("a targeted wait reads only its target, whenever it ended", () => {
    const targeted = { ...delegatedWait, target: "docs", waitingSince: iso(NOW - 10 * MINUTE) };
    expect(resumeNote(targeted, [ledger("review"), ledger("docs", { phase: "running", completedAt: null })])).toBeNull();
    expect(resumeNote(targeted, [ledger("review")])).toBeNull();
    // The target ended before the run settled: the host should have woken it at that settle.
    expect(resumeNote(targeted, [ledger("docs", { completedAt: iso(NOW - 20 * MINUTE) })])?.text).toContain("10m ago");
    // Named by its task id, as the tool also accepts.
    expect(resumeNote({ ...targeted, target: "task-docs" }, [ledger("docs", { completedAt: iso(NOW - 20 * MINUTE) })])?.tone).toBe("warning");
  });

  test("compact surfaces put warnings first", () => {
    const liveness = describeRunWaitLiveness({
      eventWait: delegatedWait,
      observedAt: iso(NOW - 5_000),
      delegates: { rows: [delegate("Writer", { status: "running", needsUser: true })] },
      now: NOW,
    });
    expect(liveness.notes.map((note) => note.tone)).toEqual(["warning", "muted"]);
    expect(liveness.since?.text).toBeTruthy();
    expect(describeRunWaitLiveness({ eventWait: null, now: NOW }).since).toBeNull();
  });
});

describe("the delegates under the run line", () => {
  const child = (phase: DelegatedTaskSummary["phase"]): DelegatedTaskSummary => ({
    runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "review", delegatedTaskId: "child-1",
    delegatedWorkspaceId: "ws-1", delegatedTurnId: null, providerId: "codex", requestedModel: null, requestedEffort: null,
    lifecycle: "isolated", phase, reason: null, attempt: 0, createdAt: iso(NOW - MINUTE), updatedAt: iso(NOW), completedAt: null,
  } as DelegatedTaskSummary);

  test("a delegate sitting between turns on its own is waiting, not working", () => {
    const waiting = fromDelegatedTask(child("waiting"));
    expect(waiting.outcome).toMatchObject({ status: "running", waiting: true });
    expect(subagentLineState(waiting)).toBe("waiting");
    expect(describeSubagentState(waiting)).toBe("waiting");
    expect(subagentCurrentStep({ ...waiting, outcome: { ...waiting.outcome, progress: ["old step"] } })).toBeNull();
    expect(subagentLineState(fromDelegatedTask(child("running")))).toBe("working");
    applyRuntimeLocale("ko");
    expect(describeSubagentState(waiting)).toBe("대기 중");
    expect(describeSubagentState(fromDelegatedTask(child("pending")))).toBe("시작 전");
  });

  test("the one that needs the user leads, live ones follow, settled ones fold while any is live", () => {
    const plan = planSubagentLine([
      delegate("a", { status: "returned" }),
      delegate("b", { status: "queued" }),
      delegate("c", { status: "returned" }),
      delegate("d", { status: "running" }),
      delegate("e", { status: "running", needsUser: true }),
      delegate("f", { status: "failed" }),
    ]);
    expect(plan.shown.map((row) => row.title)).toEqual(["e", "d", "b"]);
    expect(plan.folded).toEqual([{ state: "failed", count: 1 }, { state: "done", count: 2 }]);
    // Nothing live: each settled one keeps its name.
    expect(planSubagentLine([delegate("a", { status: "returned" })]).shown.map((row) => row.title)).toEqual(["a"]);
    expect(describeSubagentSummary([delegate("Reviewer", { status: "returned" })])).toBe("Reviewer done");
  });

  test("a delegated wait shows the working delegate moving and folds the settled ones", () => {
    const html = bar(withWait({ kind: "delegated_completion", target: null }), [
      delegate("Reviewer", { status: "running", progress: ["Reading the diff"] }),
      delegate("Writer", { status: "queued" }),
      delegate("Docs", { status: "returned" }),
    ]);
    expect(html).toContain('data-testid="shelf-subagents"');
    expect(html).toContain('data-subagent-state="working"');
    expect(html).toContain('aria-label="Working"');
    expect(html).toContain('data-subagent-state="queued"');
    expect(html).not.toContain('data-subagent-state="done"');
    expect(html).toContain("1 done");
    expect(html).toContain("Reading the diff");
    // The paragraph is plain text: no name ARIA prohibits on it.
    expect(html).not.toMatch(/<p[^>]*data-testid="shelf-subagents"[^>]*aria-label/);
  });

  test("while the run's own line moves, the delegates hold still", () => {
    const html = bar(runs.working, [delegate("Reviewer", { status: "running", progress: ["Reading the diff"] })], "Running the tests");
    expect(html).toContain('data-subagent-state="working"');
    // The pulsing lifecycle dot (it names itself "Working") gives way to a still one in the working color.
    expect(html).not.toContain('aria-label="Working"');
  });

  test("a delegate that needs the user is lifted onto the run line in the warning ink", () => {
    const html = bar(withWait({ kind: "delegated_completion", target: null }), [delegate("Writer", { status: "running", needsUser: true })]);
    expect(html).toContain('data-testid="agent-run-note-delegate"');
    expect(html).toContain("Writer needs you");
    expect(html).toContain('data-subagent-state="needs-you"');
  });

  test("no delegates, no line", () => {
    expect(bar(runs.eventWait, [])).not.toContain('data-testid="shelf-subagents"');
    expect(bar(runs.eventWait)).not.toContain('data-testid="shelf-subagents"');
  });
});

describe("the run line, Fleet card and Progress tab while waiting", () => {
  test("the run line shows the waited count with its moment and the host's last look", () => {
    const html = bar(withWait({ kind: "delegated_completion", target: null }, { eventWaitObservedAt: iso(NOW - 5_000) }));
    expect(html).toContain('data-testid="agent-run-waited"');
    expect(html).toContain('title="Waiting since ');
    expect(html).toContain('data-testid="agent-run-note-check"');
    expect(html).toContain("Checked just now");
    expect(html).not.toContain("Time since the run started");
  });

  test("a usage wait keeps its resume time and adds no waited count", () => {
    expect(bar(runs.waiting)).not.toContain('data-testid="agent-run-waited"');
  });

  test("the Fleet card shows the waited count and a stale host in the warning ink", () => {
    const html = renderToStaticMarkup(createElement(FleetAgentRunStripView, {
      detail: withWait({}, { eventWaitObservedAt: iso(Date.now() - 10 * MINUTE) }),
      onOpen: () => {},
    }));
    expect(html).toContain('data-testid="fleet-wait-note"');
    expect(html).toContain("Not checked for 10m");
    expect(html).toContain('title="Waiting since ');
  });
});
