import { afterEach, describe, expect, test } from "bun:test";
import { applyRuntimeLocale } from "@/i18n/runtime";
import { formatDateTime } from "@/i18n/format";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import { buildAgentRunFixtures } from "@/dev/agent-run-preview/agent-run-fixtures";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { classifyTaskStatus } from "@/lib/fleet/task-status";
import type { ApprovalPart, ChatMessage, UserInputPart } from "@/types/chat";
import {
  AGENT_RUN_BADGES,
  agentRunDecisionOf,
  agentRunDecisionOfMessages,
  describeAgentRunStatus,
  formatAgentRunBadge,
  type AgentRunDecision,
  type AgentRunStatus,
} from "@/lib/agent-runs/agent-run-status";
import enAgentRuns from "../src/locales/en/agentRuns.json";
import koAgentRuns from "../src/locales/ko/agentRuns.json";
import enUi from "../src/locales/en/ui.json";
import koUi from "../src/locales/ko/ui.json";

const runs = buildAgentRunFixtures(new Date("2026-10-01T09:00:00.000Z"));

/** A paused run of the working fixture, for the reasons the fixtures leave out. */
function pausedFor(pauseReason: "runtime-changed"): AgentRunDetail {
  return { ...runs.working, agentRun: { ...runs.working.agentRun, state: "paused", pauseReason, reasonDetail: "The runtime changed." } };
}

type Row = {
  name: string;
  detail: AgentRunDetail;
  decision?: AgentRunDecision;
  expected: Pick<AgentRunStatus, "badge" | "tone" | "mark" | "waiting" | "recovery">;
  /** [en, ko] badge and subtitle words; a function for a subtitle that carries a time. */
  en: [string, string | null | (() => string)];
  ko: [string, string | null | (() => string)];
};

const resumeAt = runs.waiting.agentRun.usageLimit!.resumeAt!;
const running = { badge: "running", tone: "accent", mark: { state: "working", tone: "active" }, waiting: false, recovery: null } as const;
const waiting = { badge: "running", tone: "neutral", mark: { state: "waiting", tone: "idle" }, waiting: true, recovery: null } as const;
const needsAnswer = { badge: "needs-answer", tone: "warning", mark: { state: "needs-you", tone: "waiting" }, waiting: false, recovery: null } as const;
const approval = { ...needsAnswer, mark: { state: "approval", tone: "waiting" } } as const;
const paused = { badge: "paused", tone: "neutral", mark: { state: "paused", tone: "idle" }, waiting: false, recovery: null } as const;
const halted = { badge: "halted", tone: "warning", mark: { state: "halted", tone: "waiting" }, waiting: false, recovery: null } as const;
const stopped = { badge: "stopped", tone: "neutral", mark: { state: "stopped", tone: "skipped" }, waiting: false, recovery: null } as const;

/** Spec 7.1 and A.2: every stored state, as the six badges read it. */
const ROWS: Row[] = [
  { name: "completed", detail: runs.ready, expected: { badge: "completed", tone: "success", mark: { state: "ready", tone: "done" }, waiting: false, recovery: null }, en: ["Completed", null], ko: ["완료", null] },
  { name: "cancelled by the user", detail: runs.stopped, expected: stopped, en: ["Stopped", null], ko: ["중지됨", null] },
  { name: "stopped by Stave at its turn limit", detail: runs.failed, expected: { ...stopped, recovery: "new-run" }, en: ["Stopped", null], ko: ["중지됨", null] },
  {
    name: "paused at a usage limit with a resume time",
    detail: runs.waiting,
    expected: waiting,
    en: ["Running", () => `Waiting · Usage limit (resumes ${formatDateTime(resumeAt)})`],
    ko: ["실행 중", () => `대기 · 사용량 한도 (${formatDateTime(resumeAt)} 재개)`],
  },
  { name: "paused at a usage limit without a reset", detail: runs.usageUnknown, expected: halted, en: ["Halted", "Usage limit"], ko: ["멈춤", "사용량 한도"] },
  { name: "paused after a wait expired", detail: runs.waitExpired, expected: halted, en: ["Halted", "Wait expired"], ko: ["멈춤", "대기 만료"] },
  { name: "a blocked stage", detail: runs.blocked, expected: halted, en: ["Halted", "Blocked"], ko: ["멈춤", "막힘"] },
  { name: "a stuck stage", detail: runs.stuck, expected: { ...halted, recovery: "retry-stage" }, en: ["Halted", "Blocked"], ko: ["멈춤", "막힘"] },
  { name: "paused because the task changed", detail: runs.recovery, expected: halted, en: ["Halted", "Recovery needed"], ko: ["멈춤", "복구 필요"] },
  { name: "paused because the runtime changed", detail: pausedFor("runtime-changed"), expected: halted, en: ["Halted", "Recovery needed"], ko: ["멈춤", "복구 필요"] },
  { name: "paused by the user", detail: runs.paused, expected: paused, en: ["Paused", null], ko: ["일시정지", null] },
  { name: "taken over", detail: runs.takenOver, expected: paused, en: ["Paused", "Taken over"], ko: ["일시정지", "직접 조작"] },
  { name: "running with a question open", detail: runs.working, decision: "question", expected: needsAnswer, en: ["Needs your answer", "Question"], ko: ["답변 필요", "질문"] },
  { name: "running with an approval open", detail: runs.working, decision: "approval", expected: approval, en: ["Needs your answer", "Approval"], ko: ["답변 필요", "승인"] },
  { name: "a stage waiting for a sign-off", detail: runs.signOff, expected: approval, en: ["Needs your answer", "Approval"], ko: ["답변 필요", "승인"] },
  { name: "running, waiting for an event", detail: runs.eventWait, expected: waiting, en: ["Running", "Waiting · PR checks"], ko: ["실행 중", "대기 · PR 검사"] },
  { name: "running", detail: runs.working, expected: running, en: ["Running", null], ko: ["실행 중", null] },
];

afterEach(() => applyRuntimeLocale("en"));

describe("agent run badges: the projection table", () => {
  for (const locale of ["en", "ko"] as const) {
    for (const row of ROWS) {
      test(`${locale} · ${row.name}`, () => {
        applyRuntimeLocale(locale);
        const status = describeAgentRunStatus(row.detail, row.decision ?? null);
        const [label, subtitle] = row[locale];
        expect(status).toMatchObject(row.expected);
        expect(status.label).toBe(label);
        expect(status.subtitle).toBe(typeof subtitle === "function" ? subtitle() : subtitle);
        // The mark is the shared vocabulary's: its tone is the badge's tone.
        expect(WORK_STATE[status.mark.state].tone as string).toBe(status.tone);
      });
    }
  }

  test("every badge appears in the table", () => {
    const seen = new Set(ROWS.map((row) => describeAgentRunStatus(row.detail, row.decision ?? null).badge));
    expect([...seen].sort()).toEqual([...AGENT_RUN_BADGES].sort());
  });

  test("an open decision turns only a running run to Needs your answer", () => {
    for (const detail of [runs.paused, runs.takenOver, runs.usageUnknown, runs.waitExpired, runs.ready, runs.stopped]) {
      expect(describeAgentRunStatus(detail, "question").badge).toBe(describeAgentRunStatus(detail).badge);
    }
  });

  test("a decision reads from the turn and from the Fleet status alike", () => {
    expect(agentRunDecisionOf("user_input")).toBe("question");
    expect(agentRunDecisionOf("waiting-input")).toBe("question");
    expect(agentRunDecisionOf("approval")).toBe("approval");
    expect(agentRunDecisionOf("waiting-approval")).toBe("approval");
    for (const none of [null, undefined, "running", "idle", "error"]) expect(agentRunDecisionOf(none)).toBeNull();
  });

  test("the run's decision is the unanswered card in the lead task's messages, as Fleet reads it", () => {
    const approval = (requestId: string, state: ApprovalPart["state"]): ApprovalPart =>
      ({ type: "approval", toolName: "Bash", description: "Run it", requestId, state });
    const question = (state: UserInputPart["state"]): UserInputPart =>
      ({ type: "user_input", toolName: "AskUserQuestion", requestId: "q", state, questions: [{ question: "Which?", header: "Which", options: [] }] });
    const messages = (...parts: Array<ApprovalPart | UserInputPart>): ChatMessage[] =>
      [{ id: "m", role: "assistant", providerId: "claude-code", model: "sonnet", content: "", parts }];
    const task = { id: "t", title: "t", provider: "claude-code", updatedAt: "2026-10-01T09:00:00.000Z", unread: false } as never;
    const cases: Array<[ChatMessage[], AgentRunDecision | null]> = [
      [[], null],
      [messages(approval("a", "approval-requested"), approval("b", "approval-requested")), "approval"],
      // Answering one of two leaves the other open.
      [messages(approval("a", "approval-responded"), approval("b", "approval-requested")), "approval"],
      [messages(approval("a", "approval-responded"), approval("b", "output-denied")), null],
      // A question first, as Fleet ranks it.
      [messages(approval("a", "approval-requested"), question("input-requested")), "question"],
      [messages(question("input-responded")), null],
    ];
    for (const [list, decision] of cases) {
      expect(agentRunDecisionOfMessages(list)).toBe(decision);
      expect(agentRunDecisionOfMessages(list)).toBe(agentRunDecisionOf(classifyTaskStatus({ task, messages: list })));
    }
    expect(agentRunDecisionOfMessages(undefined)).toBeNull();
  });

  test("the badge and its subtitle read as one run of words", () => {
    expect(formatAgentRunBadge(describeAgentRunStatus(runs.blocked))).toBe("Halted · Blocked");
    expect(formatAgentRunBadge(describeAgentRunStatus(runs.working))).toBe("Running");
  });
});

describe("agent run badges: copy", () => {
  const hangul = /[가-힣]/;
  test("every badge word and subtitle is in English and Korean", () => {
    const en = enAgentRuns.badge as Record<string, string>;
    const ko = koAgentRuns.badge as Record<string, string>;
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(en[key]!.trim()).not.toBe("");
      expect(ko[key]).toMatch(hangul);
    }
    for (const key of ["paused", "halted"] as const) {
      expect(enUi.stateVocabulary[key]).toBeTruthy();
      expect(koUi.stateVocabulary[key]).toMatch(hangul);
    }
  });
});
