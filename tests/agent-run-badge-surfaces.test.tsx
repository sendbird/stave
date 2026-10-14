import { afterEach, describe, expect, test } from "bun:test";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyRuntimeLocale } from "@/i18n/runtime";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { AgentRunBar } from "../src/components/agent-runs/AgentRunBar";
import { AgentRunResultCard } from "../src/components/agent-runs/AgentRunResultCard";
import { FleetAgentRunStripView } from "../src/components/agent-runs/FleetAgentRunStrip";
import { TaskSupervisionMarks } from "../src/components/agent-runs/TaskSupervisionMarks";
import { AgentActivity } from "../src/components/agents/AgentActivity";
import { TaskPanelView } from "../src/components/session/TaskPanel";
import { resolveProgressTabMark } from "../src/components/session/task-panel-marks";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { hasAgentOrigin } from "../src/lib/agent-runs/agent-run";
import {
  agentRunDecisionOfMessages,
  describeAgentRunStatus,
  formatAgentRunBadge,
  type AgentRunStatus,
} from "../src/lib/agent-runs/agent-run-status";
import { useAppStore } from "../src/store/app.store";
import { agentRunTaskKey, useAgentRunsStore } from "../src/store/agent-runs-store";
import { useFleetAgentRunsStore } from "../src/store/fleet-agent-runs-store";
import type { ApprovalPart, ChatMessage, UserInputPart } from "../src/types/chat";
import { agentRunDetail, agentRunFixture, patchCurrent } from "./fixtures/agent-run-fixtures";

/*
 * Spec 7.1: the run line, the Task panel (its Progress tab mark and the Run
 * panel), the task's mark, the Fleet card, Agent activity and the result card
 * show the same badge for the same run. Every surface is fed the way the app
 * feeds it: the run sits in the stores, its lead task's messages hold the
 * question and approval cards, and each surface derives Needs your answer
 * itself. The badge is read back from what each one draws.
 */

const START = new Date("2026-10-01T09:00:00.000Z");
const runs = buildAgentRunFixtures(START);

/* Server rendering reads each store's initial state, so the run is seeded there. */
const app = useAppStore.getInitialState();
const agentRuns = useAgentRunsStore.getInitialState();
const fleetRuns = useFleetAgentRunsStore.getInitialState();
const original = {
  app: {
    activeWorkspaceId: app.activeWorkspaceId,
    activeTaskId: app.activeTaskId,
    tasks: app.tasks,
    messagesByTask: app.messagesByTask,
    providerTurnActivityByTask: app.providerTurnActivityByTask,
    workspaceRuntimeCacheById: app.workspaceRuntimeCacheById,
  },
  agentRuns: { details: agentRuns.details, agentRunIdByTask: agentRuns.agentRunIdByTask },
  fleetRuns: { details: fleetRuns.details },
};

afterEach(() => {
  Object.assign(app, original.app);
  Object.assign(agentRuns, original.agentRuns);
  Object.assign(fleetRuns, original.fleetRuns);
  applyRuntimeLocale("en");
});

function seed(detail: AgentRunDetail, messages: ChatMessage[]) {
  const { id, workspaceId, leadTaskId } = detail.agentRun;
  Object.assign(app, {
    activeWorkspaceId: workspaceId,
    activeTaskId: leadTaskId,
    tasks: [{
      id: leadTaskId, title: "Fix the billing table", provider: "claude-code", updatedAt: START.toISOString(),
      unread: false, controlMode: "interactive", controlOwner: "stave",
    }],
    messagesByTask: { [leadTaskId]: messages },
    // The turn's single hint is not a source: answering any one card clears it.
    providerTurnActivityByTask: {},
  });
  Object.assign(agentRuns, { details: { [id]: detail }, agentRunIdByTask: { [agentRunTaskKey(workspaceId, leadTaskId)]: id } });
  Object.assign(fleetRuns, { details: { [id]: detail } });
}

function render<P extends object>(component: FunctionComponent<P>, props: P) {
  return renderToStaticMarkup(createElement(component, props));
}

/** Every badge value a surface carries, as `data-badge` (or the line's `data-state`). */
function badgesIn(html: string, attribute = "data-badge"): string[] {
  return [...new Set([...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((match) => match[1]!))];
}

function assistant(parts: Array<ApprovalPart | UserInputPart>): ChatMessage {
  return { id: "assistant-1", role: "assistant", providerId: "claude-code", model: "sonnet", content: "", turnId: "turn-6", parts };
}

function approval(requestId: string, state: ApprovalPart["state"] = "approval-requested"): ApprovalPart {
  return { type: "approval", toolName: "Bash", description: "Run the migration", requestId, state };
}

function question(state: UserInputPart["state"] = "input-requested"): UserInputPart {
  return {
    type: "user_input", toolName: "AskUserQuestion", requestId: "question-1", state,
    questions: [{ question: "Which plan gets the export?", header: "Plan", options: [] }],
  };
}

/** Renders every surface from the stores, as the app mounts them. */
function renderSurfaces(detail: AgentRunDetail, messages: ChatMessage[]) {
  seed(detail, messages);
  const { workspaceId, leadTaskId } = detail.agentRun;
  return {
    bar: render(AgentRunBar, {}),
    taskPanel: render(TaskPanelView, {
      workspaceId, taskId: leadTaskId, repositoryPath: null, managed: false, agentRun: detail, tab: "progress", onTabChange: () => {},
    }),
    sidebar: render(TaskSupervisionMarks, { taskId: leadTaskId }),
    // What FleetWorkspaceCard hands its strip: the same derivation over the lead task's messages.
    fleet: render(FleetAgentRunStripView, { detail, onOpen: () => {}, leadTaskDecision: agentRunDecisionOfMessages(messages) }),
    activity: hasAgentOrigin(detail.agentRun)
      ? render(AgentActivity, {
        assignments: [{
          id: "assignment-1", agentName: detail.agentRun.workflow.name, taskId: leadTaskId, state: "started",
          assignment: "Fix the billing table overflow on narrow screens.", createdAt: START.toISOString(),
        } as never],
      })
      : null,
    result: render(AgentRunResultCard, { taskId: leadTaskId }),
  };
}

/** Every surface of an active run wears `status`. */
function expectOneBadge(surfaces: ReturnType<typeof renderSurfaces>, status: AgentRunStatus) {
  const named = `${status.agentName}: ${formatAgentRunBadge(status)}`;
  // The line carries the badge as its state.
  expect(badgesIn(surfaces.bar, "data-state")[0]).toBe(status.badge);
  for (const html of [surfaces.taskPanel, surfaces.sidebar, surfaces.fleet]) expect(badgesIn(html)).toEqual([status.badge]);
  for (const html of [surfaces.taskPanel, surfaces.sidebar, surfaces.fleet]) expect(html).toContain(named);
  // The Progress tab marks a run only when it waits on the user, in the same words.
  const mark = resolveProgressTabMark(status);
  const progressLabel = mark?.kind === "state" ? mark.label : null;
  expect(progressLabel).toBe(status.badge === "needs-answer" || status.badge === "halted" ? formatAgentRunBadge(status) : null);
  if (progressLabel) expect(surfaces.taskPanel).toContain(`title="${progressLabel}"`);
  if (surfaces.activity !== null) expect(surfaces.activity).toContain(formatAgentRunBadge(status));
  // The result card stays away while the run is active: the bar owns its state.
  expect(surfaces.result).toBe("");
}

const ACTIVE_CASES: Array<[string, AgentRunDetail, ChatMessage[], AgentRunStatus["badge"]]> = [
  ["running", runs.working, [], "running"],
  ["running, a workflow", runs.workflow, [], "running"],
  ["running, waiting for a usage reset", runs.waiting, [], "running"],
  ["running, waiting for PR checks", runs.eventWait, [], "running"],
  ["running, every card answered", runs.working, [assistant([question("input-responded"), approval("a1", "approval-responded")])], "running"],
  ["needs your answer, a question", runs.working, [assistant([question()])], "needs-answer"],
  ["needs your answer, an approval", runs.working, [assistant([approval("a1")])], "needs-answer"],
  ["needs your answer, a sign-off", runs.signOff, [], "needs-answer"],
  ["paused", runs.paused, [], "paused"],
  ["paused, taken over", runs.takenOver, [], "paused"],
  ["paused, a card left open", runs.paused, [assistant([approval("a1")])], "paused"],
  ["halted, blocked", runs.blocked, [], "halted"],
  ["halted, stuck", runs.stuck, [], "halted"],
  ["halted, usage limit", runs.usageUnknown, [], "halted"],
  ["halted, wait expired", runs.waitExpired, [], "halted"],
  ["halted, recovery needed", runs.recovery, [], "halted"],
];

describe("one badge on every surface", () => {
  for (const locale of ["en", "ko"] as const) {
    for (const [name, detail, messages, badge] of ACTIVE_CASES) {
      test(`${locale} · ${name}`, () => {
        applyRuntimeLocale(locale);
        const status = describeAgentRunStatus(detail, agentRunDecisionOfMessages(messages));
        expect(status.badge).toBe(badge);
        expectOneBadge(renderSurfaces(detail, messages), status);
      });
    }
  }

  test("two approvals open: answering one leaves every surface on Needs your answer, answering both turns them to Running", () => {
    applyRuntimeLocale("ko");
    const steps: Array<[ChatMessage[], string]> = [
      [[assistant([approval("a1"), approval("a2")])], "답변 필요 · 승인"],
      [[assistant([approval("a1", "approval-responded"), approval("a2")])], "답변 필요 · 승인"],
      [[assistant([approval("a1", "approval-responded"), approval("a2", "approval-responded")])], "실행 중"],
    ];
    for (const [messages, words] of steps) {
      const status = describeAgentRunStatus(runs.working, agentRunDecisionOfMessages(messages));
      expect(formatAgentRunBadge(status)).toBe(words);
      const surfaces = renderSurfaces(runs.working, messages);
      expectOneBadge(surfaces, status);
      for (const html of [surfaces.taskPanel, surfaces.sidebar, surfaces.fleet, surfaces.activity!]) expect(html).toContain(words);
      expect(surfaces.bar).toContain(`data-state="${words === "실행 중" ? "running" : "needs-answer"}"`);
    }
  });

  test("an ended run's panel and result card wear the same badge", () => {
    for (const [detail, label, card] of [
      [runs.ready, "Completed", "agent-run-result"],
      [runs.failed, "Stopped", "agent-run-reason"],
      [runs.stopped, "Stopped", null],
    ] as const) {
      const status = describeAgentRunStatus(detail);
      expect(status.label).toBe(label);
      const surfaces = renderSurfaces(detail, []);
      expect(badgesIn(surfaces.taskPanel)).toEqual([status.badge]);
      expect(surfaces.taskPanel).toContain(`${status.agentName}: ${label}`);
      if (card) {
        expect(surfaces.result).toContain(`data-testid="${card}"`);
        expect(surfaces.result).toContain(`aria-label="${label}: ${status.agentName}"`);
        expect(surfaces.result).toContain(`>${label}<`);
      } else {
        // A run the user stopped leaves no card.
        expect(surfaces.result).toBe("");
      }
      expect(surfaces.activity).toContain(formatAgentRunBadge(status));
    }
  });

  test("a legacy run's line, panel, Fleet card and mark wear the same badge", () => {
    const base = agentRunFixture();
    const cases: Array<[AgentRunDetail, ChatMessage[]]> = [
      [agentRunDetail(base), []],
      [agentRunDetail(base), [assistant([approval("a1")])]],
      [agentRunDetail(patchCurrent(base, { status: "blocked", blockReason: "agent-blocked", detail: "Which plan gets the export?" })), []],
      [agentRunDetail({ ...base, agentRun: { ...base.agentRun, state: "paused", pauseReason: "taken-over", reasonDetail: "You took over." } }), []],
    ];
    for (const [detail, messages] of cases) {
      const status = describeAgentRunStatus(detail, agentRunDecisionOfMessages(messages));
      const surfaces = renderSurfaces(detail, messages);
      expect(badgesIn(surfaces.bar, "data-state")[0]).toBe(status.badge);
      for (const html of [surfaces.taskPanel, surfaces.fleet, surfaces.sidebar]) expect(badgesIn(html)).toEqual([status.badge]);
      // Plain progress names no state on the legacy line; every other badge does, in full.
      if (status.badge !== "running") expect(surfaces.bar).toContain(formatAgentRunBadge(status));
      expect(surfaces.taskPanel).toContain(`>${status.label}<`);
      expect(surfaces.fleet).toContain(formatAgentRunBadge(status));
    }
    expect(describeAgentRunStatus(cases[1]![0], agentRunDecisionOfMessages(cases[1]![1])).badge).toBe("needs-answer");
  });

  test("Agent activity reads a run in another workspace from that workspace's cache, as its Fleet card does", () => {
    const detail = runs.working;
    expect(hasAgentOrigin(detail.agentRun)).toBe(true);
    const messages = [assistant([approval("a1")])];
    seed(detail, []);
    const { workspaceId, leadTaskId } = detail.agentRun;
    const task = app.tasks[0]!;
    // Another workspace is in view; the run's lives in the runtime cache.
    Object.assign(app, {
      activeWorkspaceId: "ws-elsewhere",
      tasks: [],
      messagesByTask: {},
      workspaceRuntimeCacheById: {
        [workspaceId]: { tasks: [task], messagesByTask: { [leadTaskId]: messages }, activeTurnIdsByTask: {} },
      },
    });
    const html = render(AgentActivity, {
      assignments: [{
        id: "assignment-1", agentName: detail.agentRun.workflow.name, taskId: leadTaskId, workspaceId, state: "started",
        assignment: "Fix the billing table overflow on narrow screens.", createdAt: START.toISOString(),
      } as never],
    });
    const status = describeAgentRunStatus(detail, agentRunDecisionOfMessages(messages));
    expect(status.badge).toBe("needs-answer");
    expect(html).toContain(formatAgentRunBadge(status));
    expect(html).not.toContain(formatAgentRunBadge(describeAgentRunStatus(detail, null)));
  });
});
