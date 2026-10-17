import { FailedOutgoingMessageBubble } from "../src/components/session/FailedOutgoingMessages";
import { RunTurnTranscript } from "../src/components/session/RunTurnDialog";
import { buildFailedOutgoingSend } from "../src/store/failed-send-recovery";
import { getPromptHistoryEntries } from "../src/components/session/chat-input.utils";
import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../src/i18n";
import { QuestionReplyRow } from "../src/components/session/message/QuestionReplyRow";
import { buildQuestionReply, QuestionReplySchema, questionReplyAnswerText } from "../src/lib/question-reply";
import { formatAsyncQuestionAnswer } from "../src/lib/async-question-answer";
import { ChatMessageSchema, WorkspaceSnapshotSchema } from "../src/lib/task-context/schemas";
import { SteerTurnArgsSchema } from "../electron/main/ipc/schemas";
import { buildOutgoingUserMessage, buildSteeredUserMessageState } from "../src/store/chat-state-helpers";
import { buildPromptDraftForSend } from "../src/store/prompt-draft-send";
import { buildQueuedTurnFromDraft } from "../src/store/prompt-draft-context";
import { summarizeQueuedTurnText } from "../src/components/session/composer-shelf/composer-shelf.utils";
import { createHostTaskSteerCoordinator } from "../electron/host-service/host-task-steer";
import { createEmptyWorkspaceState } from "../src/store/workspace-session-state";

const questions = [
  { key: "scope", header: "Scope", question: "Which scope?\nChoose one.", options: [] },
  { key: "notes", header: "Notes", question: "Additional constraints?", options: [] },
];
const args = { requestId: "question-1", sourceMessageId: "missing-card", questions, answers: { scope: "This task", notes: "Keep Korean.\nCheck dark mode." } };
const reply = buildQuestionReply(args);
const content = formatAsyncQuestionAnswer(args);

test("only submitted answers are displayed; the model and history keep full context after serialization", () => {
  const row = ChatMessageSchema.parse(JSON.parse(JSON.stringify(buildOutgoingUserMessage({ id: "reply", content, questionReply: reply }))));
  expect(row.content).toBe("> Which scope?\n> Choose one.\n\nThis task\n\n> Additional constraints?\n\nKeep Korean.\nCheck dark mode.");
  expect(row.parts).toEqual([{ type: "text", text: row.content }]);
  expect(row.displayContent).toBe("Scope\nThis task\n\nNotes\nKeep Korean.\nCheck dark mode.");
  expect(row.displayParts).toEqual([{ type: "text", text: row.displayContent }]);
  expect(row.questionReply).toEqual(reply);
  expect(questionReplyAnswerText(reply)).toBe("This task\n\nKeep Korean.\nCheck dark mode.");
});

test("ordinary user quotations and old unmarked replies retain their original presentation", () => {
  const row = buildOutgoingUserMessage({ id: "ordinary", content });
  expect(row.questionReply).toBeUndefined();
  expect(row.displayContent).toBeUndefined();
  expect(row.parts).toEqual([{ type: "text", text: content }]);
});

test("queue storage and dispatch preserve provenance without touching the composer's draft", () => {
  const sourceDraft = { text: "Unsent draft", attachedFilePaths: [], attachments: [] };
  const draft = buildPromptDraftForSend({ content, questionReply: reply, preservePromptDraft: true, sourceDraft });
  const queued = buildQueuedTurnFromDraft({ draft, providerId: "codex" });
  const saved = WorkspaceSnapshotSchema.shape.promptDraftByTask.parse(JSON.parse(JSON.stringify({ task: { ...sourceDraft, queuedTurns: [queued] } })));
  const dispatched = buildPromptDraftForSend({ content: "ignored", sourceDraft, queuedTurn: saved.task!.queuedTurns![0] });
  expect(dispatched.questionReply).toEqual(reply);
  expect(dispatched.text).toBe(content);
  expect(summarizeQueuedTurnText(queued)).toBe("Scope This task Notes Keep Korean. Check dark mode.");
  expect(sourceDraft.text).toBe("Unsent draft");
});

test("steer IPC accepts bounded provenance and rejects malformed snapshots", () => {
  const request = { turnId: "turn-1", text: content, questionReply: reply };
  expect(SteerTurnArgsSchema.parse(request).questionReply).toEqual(reply);
  expect(SteerTurnArgsSchema.safeParse({ ...request, questionReply: { ...reply, questions: [] } }).success).toBe(false);
  expect(QuestionReplySchema.safeParse({ ...reply, questions: [{ question: "Missing answer" }] }).success).toBe(false);
});

test("the host-owned steer and renderer acknowledgement retain one self-contained reply", async () => {
  let session = { ...createEmptyWorkspaceState(), activeTurnIdsByTask: {}, messageCountByTask: {}, nativeSessionReadyByTask: {} };
  const coordinator = createHostTaskSteerCoordinator({ send: async () => ({ ok: true, delivery: "accepted" }),
    serialize: async (_workspace, operation) => operation(), loadSession: async () => session,
    persist: async (_turn, next) => { session = next; } });
  coordinator.register({ turnId: "turn-1", workspaceId: "ws", workspaceName: "Workspace", taskId: "task", provider: "codex", model: "model" });
  await coordinator.steer({ turnId: "turn-1", text: content, clientMessageId: "reply", questionReply: reply });
  const restored = ChatMessageSchema.parse(JSON.parse(JSON.stringify(session.messagesByTask.task![0])));
  expect(restored).toMatchObject({ displayContent: "Scope\nThis task\n\nNotes\nKeep Korean.\nCheck dark mode.", questionReply: reply, steerDeliveryState: "accepted" });
  const ack = buildSteeredUserMessageState({ messagesByTask: session.messagesByTask, messageCountByTask: session.messageCountByTask, taskId: "task", content, questionReply: reply, clientMessageId: "reply", steeredIntoTurnId: "turn-1", provider: "codex", activeModel: "model", turnStillActive: false });
  expect(ack.messagesByTask.task).toHaveLength(1);
});

test("decline has no fabricated user text, and defaults never become answers", () => {
  const declined = buildQuestionReply({ ...args, denied: true });
  const row = buildOutgoingUserMessage({ id: "declined", content: formatAsyncQuestionAnswer({ ...args, denied: true }), questionReply: declined });
  expect(row.displayContent).toBe("");
  expect(questionReplyAnswerText(declined)).toBe("");
  expect(declined.questions.every(({ answer }) => answer === "")).toBe(true);
  expect(buildQuestionReply({ ...args, answers: {}, questions: [{ ...questions[0]!, defaultValue: "Recommended" }] }).questions[0]!.answer).toBe("");
});

test("a reply disclosure is collapsed, keyboard-operable, and independent of the missing source card", () => {
  const html = renderToStaticMarkup(createElement(QuestionReplyRow, { reply }));
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain(i18n.t("session:questionReply.label", { count: 2 }));
  expect(html).not.toContain("Which scope?");
  expect(html).not.toContain('aria-disabled="true"');
  expect(html).not.toMatch(/<button[^>]*\sdisabled[=\s>]/);
});

test("failed sends and the Run turn dialog use answer-only bubbles with question disclosure", () => {
  const send = buildFailedOutgoingSend({ id: "failed", taskId: "task", failedAt: "2026-01-01T00:00:00.000Z", draft: { text: content, questionReply: reply, attachedFilePaths: [], attachments: [] }, error: "offline" });
  const failed = renderToStaticMarkup(createElement(FailedOutgoingMessageBubble, { send, retryPending: false, onRetry() {}, onDismiss() {} }));
  const message = buildOutgoingUserMessage({ id: "reply", content, questionReply: reply });
  const run = renderToStaticMarkup(createElement(RunTurnTranscript, { messages: [message], taskId: "task", turnId: "turn-1" }));
  for (const html of [failed, run]) {
    expect(html).toContain("This task");
    expect(html).toContain("data-question-reply");
    expect(html).not.toContain("Which scope?");
  }
  expect(send.questionReply).toEqual(reply);
  expect(getPromptHistoryEntries([message])).toEqual([content]);
});
