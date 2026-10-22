import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { APPROVAL_RECORD_LIST_LIMIT, ApprovalRecordView } from "../src/components/approvals/ApprovalRecord";
import { ReviewInspector } from "../src/components/review/ReviewInspector";
import { ToolApprovalCard } from "../src/components/session/ToolApprovalCard";
import { TurnApprovalRecord } from "../src/components/session/TurnApprovalRecord";
import { approvalsFromRunTurn } from "../src/components/review/useReviewApprovals";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { collectApprovalRecord } from "../src/lib/approvals/approval-record";
import { useAppStore } from "../src/store/app.store";
import type { ApprovalPart, ChatMessage } from "../src/types/chat";

const AT = "2026-10-22T09:00:00.000Z";

const part = (requestId: string, overrides: Partial<ApprovalPart>): ApprovalPart => ({
  type: "approval", toolName: "Bash", description: "Run the tests", input: "bun test", requestId, state: "approval-responded", ...overrides,
});

/** One run: one request you allowed, two allowed automatically, one denied when nobody answered. */
const runParts: ApprovalPart[] = [
  part("a", { resolution: { decision: "allowed", source: "user", decidedAt: AT, scope: "once" } }),
  part("b", { input: "src/app.ts", toolName: "Edit", prompted: false, resolution: { decision: "allowed", source: "provider-auto", reason: "permission-mode", decidedAt: AT } }),
  part("c", { prompted: false, resolution: { decision: "allowed", source: "rule", reason: "autonomy", decidedAt: AT } }),
  part("d", { input: "rm -rf dist", state: "output-denied", resolution: { decision: "denied", source: "rule", reason: "timeout", decidedAt: AT } }),
];

function message(parts: ApprovalPart[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "m-1", role: "assistant", model: "claude-opus", providerId: "claude-code", content: "", turnId: "turn-1", parts, ...overrides };
}

/** Server rendering reads the store's initial state, so the task is written there for one render. */
function renderWithState(patch: Record<string, unknown>, element: Parameters<typeof renderToStaticMarkup>[0]) {
  const initial = useAppStore.getInitialState() as unknown as Record<string, unknown>;
  const saved = Object.fromEntries(Object.keys(patch).map((key) => [key, initial[key]]));
  Object.assign(initial, patch);
  try {
    return renderToStaticMarkup(element);
  } finally {
    Object.assign(initial, saved);
  }
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

afterEach(() => applyAppLocale("en"));

describe("approval record view", () => {
  test("counts what you decided apart from what was decided automatically, and says who decided each", () => {
    const markup = text(renderToStaticMarkup(createElement(ApprovalRecordView, { entries: collectApprovalRecord([message(runParts)]), emptyText: "none" })));
    expect(markup).toContain("1 allowed by you · 1 allowed by a Stave rule · 1 allowed by the provider's mode · 1 denied");
    expect(markup).toContain("Bash · bun test allowed by you");
    expect(markup).toContain("Edit · src/app.ts allowed by the permission mode");
    expect(markup).toContain("Bash · bun test allowed by autonomous mode");
    expect(markup).toContain("Bash · rm -rf dist denied by Stave, after no answer in time");

    applyAppLocale("ko");
    const korean = text(renderToStaticMarkup(createElement(ApprovalRecordView, { entries: collectApprovalRecord([message(runParts)]), emptyText: "none" })));
    expect(korean).toContain("사용자 허용 1건 · Stave 규칙 허용 1건 · 제공자 모드 허용 1건 · 거부 1건");
    expect(korean).toContain("Bash · bun test 자율 모드 허용");
    expect(korean).toContain("Bash · rm -rf dist 응답 시간 초과 거부");
  });

  test("older requests without a record, open ones and withdrawn ones say so; a long record shows its latest", () => {
    const markup = text(renderToStaticMarkup(createElement(ApprovalRecordView, {
      entries: collectApprovalRecord([message([part("old", {}), part("open", { state: "approval-requested" }), part("gone", { state: "approval-interrupted" })])]),
      emptyText: "none",
    })));
    expect(markup).toContain("0 allowed by you · 0 allowed by a Stave rule · 0 allowed by the provider's mode · 1 waiting · 1 withdrawn · 1 without a record of who decided");
    expect(markup).toContain("allowed; who decided was not recorded");
    expect(markup).toContain("waiting for your answer");
    expect(markup).toContain("withdrawn when the turn ended");

    const many = Array.from({ length: APPROVAL_RECORD_LIST_LIMIT + 3 }, (_, index) => part(`r${index}`, { prompted: false, resolution: { decision: "allowed", source: "rule", reason: "autonomy", decidedAt: AT } }));
    const long = renderToStaticMarkup(createElement(ApprovalRecordView, { entries: collectApprovalRecord([message(many)]), emptyText: "none" }));
    expect(long.match(/<li/g)?.length).toBe(APPROVAL_RECORD_LIST_LIMIT);
    expect(text(long)).toContain(`Showing the latest ${APPROVAL_RECORD_LIST_LIMIT} of ${APPROVAL_RECORD_LIST_LIMIT + 3}.`);
    expect(text(renderToStaticMarkup(createElement(ApprovalRecordView, { entries: [], emptyText: "No approval requests in this turn." })))).toContain("No approval requests in this turn.");
  });

  test("Review lists the approvals of its scope: the turn, or the whole task", () => {
    const messages = [message(runParts), message([part("later", { state: "output-denied", resolution: { decision: "denied", source: "user", decidedAt: AT } })], { id: "m-2", turnId: "turn-2" })];
    const state = { activeWorkspaceId: "ws-1", messagesByTask: { "task-1": messages }, messageCountByTask: { "task-1": messages.length } };
    const render = (scope: Parameters<typeof ReviewInspector>[0]["scope"]) =>
      text(renderWithState(state, createElement(ReviewInspector, { taskId: "task-1", workspaceId: "ws-1", scope, detail: undefined })));
    expect(render({ kind: "turn", taskId: "task-1", turnId: "turn-2" })).toContain("0 allowed by you · 0 allowed by a Stave rule · 0 allowed by the provider's mode · 1 denied");
    expect(render({ kind: "branch" })).toContain("1 allowed by you · 1 allowed by a Stave rule · 1 allowed by the provider's mode · 2 denied");
  });

  test("an older turn's approvals are read from saved history, not reported as none", () => {
    // The conversation holds only the newest turn; the reviewed one is in an older page.
    const state = { activeWorkspaceId: "ws-1", messagesByTask: { "task-1": [message(runParts, { id: "m-9", turnId: "turn-9" })] }, messageCountByTask: { "task-1": 40 } };
    const raw = renderWithState(state, createElement(ReviewInspector, { taskId: "task-1", workspaceId: "ws-1", scope: { kind: "turn", taskId: "task-1", turnId: "turn-1" }, detail: undefined }));
    const approvals = raw.slice(raw.indexOf('aria-label="Approvals"'), raw.indexOf('aria-label="Lens checks"'));
    expect(text(approvals)).not.toContain("No approval requests in this turn.");
    expect(text(approvals)).not.toContain("allowed by you");
    expect(approvals).toContain('aria-busy="true"');
  });

  test("a stage lists the approvals of the turns that started while it ran", () => {
    const detail = structuredClone(buildAgentRunFixtures(new Date(AT)).signOff) as AgentRunDetail;
    const stage = detail.stages.find((record) => record.stageId === "reproduce")!;
    stage.startedAt = "2026-10-22T09:00:00.000Z";
    stage.endedAt = "2026-10-22T09:30:00.000Z";
    const messages = [
      message([part("before", { resolution: { decision: "allowed", source: "user", decidedAt: AT } })], { id: "m-0", turnId: "turn-0", startedAt: "2026-10-22T08:00:00.000Z" }),
      message([part("during", { prompted: false, resolution: { decision: "allowed", source: "rule", reason: "autonomy", decidedAt: AT } })], { id: "m-1", turnId: "turn-1", startedAt: "2026-10-22T09:10:00.000Z" }),
    ];
    const markup = text(renderWithState(
      { activeWorkspaceId: "ws-1", messagesByTask: { "task-1": messages }, messageCountByTask: { "task-1": messages.length } },
      createElement(ReviewInspector, { taskId: "task-1", workspaceId: "ws-1", scope: { kind: "stage", agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: stage.attempt }, detail }),
    ));
    expect(markup).toContain("0 allowed by you · 1 allowed by a Stave rule · 0 allowed by the provider's mode");
  });

  test("a turn read from saved history gives its approvals; a failed read is an error, a turn gone from history says so", () => {
    expect(approvalsFromRunTurn({ status: "loading" })).toEqual({ status: "pending" });
    expect(approvalsFromRunTurn({ status: "missing" })).toEqual({ status: "ready", data: null });
    expect(approvalsFromRunTurn({ status: "failed", message: "disk" }).status).toBe("error");
    const loaded = approvalsFromRunTurn({ status: "ready", messages: [message(runParts, { turnId: "turn-1" })] });
    expect(loaded.status === "ready" ? loaded.data?.map((entry) => entry.standing) : null).toEqual(["allowed-by-you", "allowed-by-provider", "allowed-by-rule", "denied-by-rule"]);
  });

  test("Activity folds the listed turn's approvals to their counts", () => {
    const state = {
      activeWorkspaceId: "ws-1",
      activeTaskId: "task-1",
      taskWorkspaceIdById: { "task-1": "ws-1" },
      activeTurnIdsByTask: {},
      messagesByTask: { "task-1": [message(runParts)] },
    };
    const markup = renderWithState(state, createElement(TurnApprovalRecord));
    expect(markup).toContain('data-testid="turn-approval-record"');
    expect(text(markup)).toContain("Approvals in this turn 1 allowed by you · 1 allowed by a Stave rule · 1 allowed by the provider's mode · 1 denied");
    expect(markup.match(/data-testid="approval-record-counts"/g)).toBeNull();
    expect(renderWithState({ ...state, messagesByTask: { "task-1": [message([])] } }, createElement(TurnApprovalRecord))).toBe("");
  });

  test("a decided card names who decided and when, and a person's grant", () => {
    const card = (approval: ApprovalPart) => text(renderToStaticMarkup(createElement(ToolApprovalCard, { part: approval, onDecide: () => {} })));
    const always = card(part("a", { resolution: { decision: "allowed", source: "user", decidedAt: AT, scope: "always" } }));
    expect(always).toContain("Always allowed");
    expect(always).toContain("by you");
    expect(card(part("d", { state: "output-denied", resolution: { decision: "denied", source: "rule", reason: "timeout", decidedAt: AT } }))).toContain("by Stave, after no answer in time");
    const old = card(part("old", {}));
    expect(old).toContain("Allowed");
    expect(old).not.toContain(" by ");
    applyAppLocale("ko");
    expect(card(part("a", { resolution: { decision: "allowed", source: "user", decidedAt: AT, scope: "once" } }))).toContain("사용자 결정");
  });
});
