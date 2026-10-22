import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ReviewDecisions } from "../src/components/review/ReviewDecisions";
import { TurnOutputResult } from "../src/components/review/ReviewOutputs";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { describeStageDecision, stageToReview } from "../src/lib/review/review-stage";
import { useAppStore } from "../src/store/app.store";

const START = new Date("2026-10-22T09:00:00.000Z");

/** A run waiting for sign-off after its Reproduce stage, which ran from a known commit. */
function waitingRun(): AgentRunDetail {
  const detail = structuredClone(buildAgentRunFixtures(START).signOff) as AgentRunDetail;
  const reproduce = detail.stages.find((record) => record.stageId === "reproduce")!;
  reproduce.startHeadSha = "a".repeat(40);
  reproduce.endedAt = "2026-10-22T09:20:00.000Z";
  return detail;
}
const reviewed = (detail: AgentRunDetail) => ({ agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 });

/** A decision at a gate: a sign-off names the stage it starts, a request for changes the stage it was asked at. */
function event(detail: AgentRunDetail, kind: "sign-off" | "changes-requested", createdAt: string, sequence: number, gate = "cause", rerun?: { stageId: string; attempt: number }) {
  const eventDetail = kind === "sign-off" ? { stageId: gate, attempt: 1 } : { atStageId: gate, rerunStageId: rerun?.stageId ?? "reproduce", attempt: rerun?.attempt ?? 2 };
  return { id: `event-${sequence}`, agentRunId: detail.agentRun.id, sequence, kind, idempotencyKey: null, detail: eventDetail, createdAt };
}

/** Reproduce (A) and Cause (B) ran; Fix (C) waits for sign-off, which is about B. A was signed off at its own gate. */
function laterRun(): AgentRunDetail {
  const detail = waitingRun();
  const [reproduce, cause] = detail.stages as [AgentRunDetail["stages"][number], AgentRunDetail["stages"][number]];
  const ranCause = { ...cause, status: "completed" as const, startedAt: "2026-10-22T09:21:00.000Z", endedAt: "2026-10-22T09:40:00.000Z", startHeadSha: "b".repeat(40) };
  detail.stages = [reproduce, ranCause, { ...cause, stageId: "fix", status: "awaiting-sign-off" as const, startedAt: null, endedAt: null, startHeadSha: null }];
  detail.agentRun.currentStageIndex = 2;
  detail.events = [event(detail, "sign-off", "2026-10-22T09:20:30.000Z", 1, "cause")];
  return detail;
}

afterEach(() => applyAppLocale("en"));

/** Server rendering reads the store's initial state, so the comments are written there for one render. */
function renderWithComments(comments: Record<string, unknown[]>, element: Parameters<typeof renderToStaticMarkup>[0]) {
  const initial = useAppStore.getInitialState() as unknown as { reviewCommentsByTask: Record<string, unknown[]> };
  const saved = initial.reviewCommentsByTask;
  initial.reviewCommentsByTask = comments;
  try {
    return renderToStaticMarkup(element);
  } finally {
    initial.reviewCommentsByTask = saved;
  }
}

describe("Review decisions", () => {
  test("Review changes on a sign-off opens the stage the sign-off is about", () => {
    const detail = waitingRun();
    expect(stageToReview(detail)).toEqual(reviewed(detail));
    expect(stageToReview(undefined)).toBeUndefined();
  });

  test("a stage waiting for sign-off offers Sign off and Ask for changes on the waiting record", () => {
    const detail = waitingRun();
    const decision = describeStageDecision(detail, reviewed(detail));
    expect(decision).toEqual({ status: "waiting", signOff: { agentRunId: detail.agentRun.id, stageId: "cause", attempt: 1 }, canAskForChanges: true });
    const markup = renderToStaticMarkup(createElement(ReviewDecisions, {
      taskId: "preview-task", workspaceId: "preview-workspace", scope: { kind: "stage", ...reviewed(detail) }, detail, read: [], data: null, latestTurnId: null,
    }));
    expect(markup).toContain("Waiting for your sign-off");
    expect(markup).toContain("Sign off");
    expect(markup).toContain("Ask for changes");
    expect(markup).not.toContain("Mark reviewed");
  });

  test("a sign-off waiting about a later stage is not offered on an earlier one", () => {
    const detail = laterRun();
    const a = { agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 };
    const b = { agentRunId: detail.agentRun.id, stageId: "cause", attempt: 1 };
    // C waits about B: only B offers Sign off; A shows its own, earlier decision.
    expect(describeStageDecision(detail, b)).toMatchObject({ status: "waiting", signOff: { stageId: "fix", attempt: 1 } });
    expect(describeStageDecision(detail, a)).toEqual({ status: "signed-off", at: "2026-10-22T09:20:30.000Z" });
    const markup = renderToStaticMarkup(createElement(ReviewDecisions, {
      taskId: "preview-task", workspaceId: "preview-workspace", scope: { kind: "stage", ...a }, detail, read: [], data: null, latestTurnId: null,
    }));
    expect(markup).not.toContain(">Sign off<");
    expect(markup).not.toContain("Ask for changes");
  });

  test("a later stage's decision is not shown on an earlier stage", () => {
    const detail = laterRun();
    detail.agentRun.state = "completed" as never;
    // B's gate asked for changes after A's gate signed A off.
    detail.events = [...detail.events, event(detail, "changes-requested", "2026-10-22T09:41:00.000Z", 2, "fix", { stageId: "cause", attempt: 2 })];
    const a = { agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 };
    const b = { agentRunId: detail.agentRun.id, stageId: "cause", attempt: 1 };
    expect(describeStageDecision(detail, a)).toEqual({ status: "signed-off", at: "2026-10-22T09:20:30.000Z" });
    expect(describeStageDecision(detail, b)).toEqual({ status: "changes-asked", at: "2026-10-22T09:41:00.000Z" });
  });

  test("after the decision the stage says how it was decided, latest first", () => {
    const detail = waitingRun();
    detail.agentRun.state = "completed" as never;
    detail.events = [...detail.events, event(detail, "changes-requested", "2026-10-22T09:25:00.000Z", 90), event(detail, "sign-off", "2026-10-22T09:40:00.000Z", 91)];
    expect(describeStageDecision(detail, reviewed(detail))).toEqual({ status: "signed-off", at: "2026-10-22T09:40:00.000Z" });
    detail.events = [...detail.events, event(detail, "changes-requested", "2026-10-22T09:45:00.000Z", 92)];
    expect(describeStageDecision(detail, reviewed(detail))).toEqual({ status: "changes-asked", at: "2026-10-22T09:45:00.000Z" });
    // A decision before the stage ended belongs to an earlier stage.
    detail.events = [event(detail, "sign-off", "2026-10-22T09:10:00.000Z", 93)];
    expect(describeStageDecision(detail, reviewed(detail))).toEqual({ status: "none" });
  });

  test("an output read on its own is not reviewed: Outputs say read and reviewed apart, like the decision bar", () => {
    const render = (result: { reviewedAt: string | null; markedReviewedAt?: string | null }) =>
      renderToStaticMarkup(createElement(TurnOutputResult, { result: { ...result, summary: "Done." } })).replace(/<[^>]+>/g, " ");
    // Read automatically after a dwell, never marked reviewed.
    const readOnly = render({ reviewedAt: "2026-10-22T09:30:00.000Z", markedReviewedAt: null });
    expect(readOnly).toContain("Not reviewed yet");
    expect(readOnly).toContain("Read Oct 22, 2026");
    expect(readOnly).not.toContain("Reviewed Oct");
    const reviewed = render({ reviewedAt: "2026-10-22T09:30:00.000Z", markedReviewedAt: "2026-10-22T09:40:00.000Z" });
    expect(reviewed).toContain("Reviewed Oct 22, 2026");
    expect(render({ reviewedAt: null })).toContain("Not read yet");
  });

  test("a plain task offers Mark reviewed and Send comments, never the stage decisions", () => {
    const comments = { "task-1": [{ id: "c1", filePath: "src/a.ts", line: 3, body: "Rename this.", createdAt: "2026-10-22T09:00:00.000Z" }] };
    const markup = renderWithComments(comments, createElement(ReviewDecisions, {
      taskId: "task-1", workspaceId: "workspace-1", scope: { kind: "uncommitted" }, detail: undefined, read: ["src/a.ts"],
      data: { files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }, { path: "src/b.ts", status: "added", additions: 2, deletions: 0 }], limits: [], baseSha: null, baseRef: null, headSha: null },
      latestTurnId: "turn-1",
    }));
    expect(markup).toContain("Send comments");
    expect(markup).toContain("1 of 2 files read · 1 comment not sent");
    expect(markup).not.toContain("Sign off");
    applyAppLocale("ko");
    const korean = renderWithComments(comments, createElement(ReviewDecisions, {
      taskId: "task-1", workspaceId: "workspace-1", scope: { kind: "uncommitted" }, detail: undefined, read: [], data: null, latestTurnId: null,
    }));
    expect(korean).toContain("코멘트 보내기");
    expect(korean).toContain("검토할 저장된 결과가 아직 없음");
  });
});
