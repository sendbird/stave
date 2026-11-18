import { selectTarsPlannerWork } from "../electron/main/tars-context";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsReceiptRow, tarsReceiptRefusalKey } from "../src/components/tars/TarsReceiptRow";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { followUpFixture } from "./tars-follow-up-fixture";
import { TarsMessageInputSchema, tarsMessageView, type TarsDecisionAction } from "@/lib/tars/conversation";
import { tarsAskDecisionId } from "@/lib/tars/decisions";
import { tarsSelectedWorkRefusal } from "@/lib/tars/selected-work";
import { beginTarsDraftSend, flushTarsDraft, hydrateTarsDraft, resetTarsDraftForTests, setTarsDraftTarget, setTarsDraftText, settleTarsDraftSend, useTarsDraftStore } from "@/store/tars-draft-store";
import type { TarsComposerDraft } from "@/lib/tars/composer-draft";

afterEach(resetTarsDraftForTests);

test.each(["ambiguous reference", "selection conflicts with words"])("representative receives clarification instructions and the actual candidates: %s", async (scenario) => {
  const f = followUpFixture();
  try {
    const selected = f.responsibility("running");
    const other = f.responsibility("running");
    const conflicting = scenario === "selection conflicts with words";
    const text = conflicting ? `Pause ${other.title}, not ${selected.title}.` : "Pause that release check.";
    f.service.start();
    const message = f.service.sendMessage({ requestId: "clarify", text,
      ...(conflicting ? { target: { responsibilityId: selected.id } } : {}) });
    await f.service.whenIdle();
    // Inspect the coordinator's real execution input, not a standalone prompt builder or a fake model's answer.
    const prompt = f.planner[0]!.input.prompt;
    const instruction = prompt.split("\n\n").find((paragraph) => paragraph.includes("If words conflict with the selection"));
    expect(instruction).toMatch(/If words conflict with the selection, or natural-language references have several plausible candidates, ask the user to select or clear a target and return actions:\[\]/);
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));
    expect(data.currentMessage.text).toBe(text);
    expect(data.currentMessage.target).toEqual(conflicting ? { responsibilityId: selected.id } : undefined);
    expect(data.observation.responsibilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: selected.id, title: selected.title }),
      expect.objectContaining({ id: other.id, title: other.title }),
    ]));
    expect(f.conversations.get(message.id)?.state).toBe("answered");
    expect(f.planner).toHaveLength(1);
  } finally { await f.close(); }
});

test("completed selection continues only through the same work's follow-up path, never replacement work", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("completed");
    f.replies.push({ reply: "Follow-up proposals", actions: [
      { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "message", input: { text: "Improve the result" } },
      { kind: "delegate", workspaceId: "source", title: "Replacement", instruction: "Improve the result", acceptanceCriteria: ["Done"], priority: 50 },
      { kind: "show", responsibilityId: row.id, view: "report" },
    ] });
    f.service.start();
    const message = f.service.sendMessage({ requestId: "completed-follow-up", text: "Improve the result", target: { responsibilityId: row.id } });
    await f.service.whenIdle();
    const receipts = f.conversations.listReceipts(message.id);
    // The selection admits the same-work message; the host's own continuation admission decides it.
    // This fixture wires no continuation port, so that admission refuses it as unavailable.
    expect(receipts.map(({ status, reason }) => ({ status, reason }))).toEqual([
      { status: "rejected", reason: "runRefused" }, { status: "rejected", reason: "targetMismatch" }, { status: "applied", reason: null },
    ]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
    expect(f.runControls).toEqual([]);
    for (const locale of ["en", "ko"] as const) {
      await applyAppLocale(locale);
      const html = renderToStaticMarkup(createElement(TarsReceiptRow, { receipt: receipts[1]!, titleOf: () => row.title }));
      expect(html).toContain('data-tars-receipt="rejected"');
      expect(html).toContain('data-tars-reason="targetMismatch"');
      expect(html).toContain(i18n.t("shell:tars.selection.refusal.targetMismatch"));
      expect(html).not.toContain(receipts[1]!.error!);
    }
  } finally { await applyAppLocale("en"); await f.close(); }
});

test("selection survives draft restart, idempotent retry and target edits without clearing newer drafts", async () => {
  let saved: TarsComposerDraft | null = null;
  const bridge = { getDraft: async () => saved, saveDraft: async ({ draft }: { draft: TarsComposerDraft | null }) => { saved = draft; } };
  await hydrateTarsDraft(bridge);
  setTarsDraftTarget({ responsibilityId: "stable-id" });
  await flushTarsDraft();
  expect(saved).toMatchObject({ text: "", target: { responsibilityId: "stable-id" } });
  resetTarsDraftForTests();
  await hydrateTarsDraft(bridge);
  setTarsDraftText("Use the second proposal");
  const first = (await beginTarsDraftSend())!;
  expect(first.target?.responsibilityId).toBe("stable-id");
  expect((await beginTarsDraftSend())?.requestId).toBe(first.requestId);
  setTarsDraftTarget({ responsibilityId: "other-id" });
  settleTarsDraftSend({ ...first, outcome: "sent" });
  expect(useTarsDraftStore.getState().target?.responsibilityId).toBe("other-id");
  expect((await beginTarsDraftSend())?.requestId).not.toBe(first.requestId);
  setTarsDraftTarget(undefined);
  expect(useTarsDraftStore.getState().target).toBeUndefined();
});

test("real message persistence and representative prompt keep identity through rename, state change and database reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tars-target-"));
  const filename = join(dir, "store.sqlite");
  let f = followUpFixture({ filename });
  try {
    const row = f.responsibility("running");
    f.responsibility("running");
    f.service.start();
    const message = f.service.sendMessage({ requestId: "selected", text: "Please check this result", target: { responsibilityId: row.id } });
    await f.service.whenIdle();
    expect(tarsMessageView(f.conversations.get(message.id)!).target).toEqual({ responsibilityId: row.id });
    expect(f.planner[0]?.input.prompt).toContain(`"target":{"responsibilityId":"${row.id}"}`);
    const current = f.responsibilities.get(row.id)!;
    f.responsibilities.patch(row.id, current.revision, { state: "blocked" }, f.now());
    // The public patch contract keeps titles immutable today. Simulate a future rename in persisted data.
    f.database.prepare("UPDATE tars_responsibilities SET body_json = json_set(body_json, '$.title', ?) WHERE id = ?").run("Renamed work", row.id);
    await f.close();
    f = followUpFixture({ filename });
    expect(f.conversations.get(message.id)?.target).toEqual({ responsibilityId: row.id });
    expect(f.responsibilities.get(row.id)?.state).toBe("blocked");
    expect(f.responsibilities.get(row.id)?.title).toBe("Renamed work");
    expect(() => f.conversations.create({ requestId: "selected", text: message.text, target: { responsibilityId: "other" } }, f.now())).toThrow("different message");
  } finally { await f.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("host refuses cross-target actions and replacement delegation without creating work; selected show still works", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("running");
    const other = f.responsibility("running");
    f.replies.push({ reply: "Proposals", actions: [
      { kind: "delegate", workspaceId: "source", title: "Replacement", instruction: "Create replacement", acceptanceCriteria: ["Done"], priority: 50 },
      { kind: "control", responsibilityId: other.id, expectedRevision: other.revision, operation: "pause" },
      { kind: "show", responsibilityId: row.id, view: "report" },
    ] });
    f.service.start();
    const m = f.service.sendMessage({ requestId: "targeted", text: "Improve this work", target: { responsibilityId: row.id } });
    await f.service.whenIdle();
    const receipts = f.conversations.listReceipts(m.id);
    expect(receipts.map((r) => r.status)).toEqual(["rejected", "rejected", "applied"]);
    expect(receipts.slice(0, 2).map((r) => r.reason)).toEqual(["targetMismatch", "targetMismatch"]);
    for (const lang of ["en", "ko"] as const) {
      await applyAppLocale(lang);
      const key = tarsReceiptRefusalKey(receipts[0]!);
      expect(key).toBe("shell:tars.selection.refusal.targetMismatch");
      expect(i18n.t(key!)).not.toContain("shell:");
      if (lang === "ko") expect(i18n.t(key!)).toContain("선택");
    }
    await applyAppLocale("en");
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(2);
    expect(f.runControls).toEqual([]);
  } finally { await f.close(); }
});

test("structured reply choice preserves the question's selected work without granting execution", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("running");
    f.replies.push({ reply: "Choose after viewing the comparison.", actions: [{ kind: "ask", question: "Which result should we use?", options: [
      { label: "Use option A", rationale: "Keep the first layout", effect: { kind: "reply" } },
      { label: "Use option B", rationale: "Use the second layout", effect: { kind: "reply" } },
    ] }] });
    f.service.start();
    const m = f.service.sendMessage({ requestId: "compare", text: "Compare the results", target: { responsibilityId: row.id } });
    await f.service.whenIdle();
    const result = await f.service.answerDecision({ decisionId: tarsAskDecisionId(m.id, 0), optionIndex: 1, source: "click" });
    await f.service.whenIdle();
    const answer = f.conversations.get(result.answer!.messageId!)!;
    expect(answer.text).toBe("Use option B");
    expect(answer.target).toEqual({ responsibilityId: row.id });
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  } finally { await f.close(); }
});

test("selection schema rejects injected authority; missing and mismatched targets fail closed", () => {
  expect(TarsMessageInputSchema.safeParse({ requestId: "r", text: "go", target: { responsibilityId: "x", approved: true } }).success).toBe(false);
  const action: TarsDecisionAction = { kind: "control", responsibilityId: "other", expectedRevision: 1, operation: "pause" };
  const selected = { id: "selected", taskId: "task-1", executionWorkspaceId: "workspace-1" };
  expect(tarsSelectedWorkRefusal({ responsibilityId: "selected" }, action, selected)?.error).toContain("another target");
  expect(tarsSelectedWorkRefusal({ responsibilityId: "selected" }, action, undefined)?.error).toContain("unavailable");
  expect(tarsSelectedWorkRefusal(undefined, action, undefined)).toBeNull();
});


test("selected publication still checks completion and never publishes from selection alone", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("running");
    f.replies.push({ reply: "PR requested", actions: [{ kind: "publish", responsibilityId: row.id, expectedRevision: row.revision }] });
    f.service.start();
    const m = f.service.sendMessage({ requestId: "publish-selected", text: "Prepare the PR", target: { responsibilityId: row.id } });
    await f.service.whenIdle();
    expect(f.conversations.listReceipts(m.id)[0]).toMatchObject({ status: "rejected", reason: "notCompleted" });
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.get(row.id)?.publication).toBeUndefined();
  } finally { await f.close(); }
});

test("a missing selected target cannot delegate or control a surviving similarly named work", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("running");
    f.replies.push({ reply: "Wrong inferred target", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "pause" }] });
    f.service.start();
    const m = f.service.sendMessage({ requestId: "missing", text: "Pause that work", target: { responsibilityId: "no-longer-present" } });
    await f.service.whenIdle();
    expect(f.conversations.listReceipts(m.id)[0]).toMatchObject({ status: "rejected", reason: "targetUnavailable" });
    expect(f.runControls).toEqual([]);
  } finally { await f.close(); }
});


test("an explicit old completed selection stays first in bounded context despite many identical title matches", async () => {
  const f = followUpFixture();
  try {
    const sample = f.responsibility("running");
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...sample, id: `work-${i}`, title: "Same title" }));
    const selected = { ...sample, id: "selected-old-work", title: "Same title", state: "completed" as const };
    rows.push(selected);
    const observed = selectTarsPlannerWork(rows, { text: "Improve Same title", target: { responsibilityId: selected.id } }, 2);
    expect(observed).toHaveLength(2);
    expect(observed[0]?.id).toBe(selected.id);
  } finally { await f.close(); }
});

test("every action kind stays on the selected work or is refused before admission", () => {
  const work = { id: "selected", taskId: "task-selected", executionWorkspaceId: "workspace-selected" };
  const target = { responsibilityId: work.id };
  const verdict = (action: TarsDecisionAction, withdrawn: TarsDecisionAction | null = null) => tarsSelectedWorkRefusal(target, action, work, withdrawn)?.reason ?? null;
  const pauseSelected: TarsDecisionAction = { kind: "control", responsibilityId: work.id, expectedRevision: 1, operation: "pause" };
  const pauseOther: TarsDecisionAction = { kind: "control", responsibilityId: "other", expectedRevision: 1, operation: "pause" };
  const ask = (responsibilityId: string): TarsDecisionAction => ({ kind: "ask", question: "Which?", options: [
    { label: "Pause", rationale: "Stop it", effect: { kind: "control", responsibilityId, expectedRevision: 1, operation: "pause" } },
    { label: "Keep", rationale: "Leave it", effect: { kind: "reply" } }] });
  const cases: [TarsDecisionAction, string | null, TarsDecisionAction?][] = [
    [pauseSelected, null], [pauseOther, "targetMismatch"],
    [{ kind: "show", responsibilityId: work.id, view: "report" }, null], [{ kind: "show", responsibilityId: "other", view: "report" }, "targetMismatch"],
    [{ kind: "inspect", responsibilityId: "other", view: "report" }, "targetMismatch"],
    [{ kind: "publish", responsibilityId: work.id, expectedRevision: 1 }, null], [{ kind: "publish", responsibilityId: "other", expectedRevision: 1 }, "targetMismatch"],
    [{ kind: "reprioritize", responsibilityId: "other", expectedRevision: 1, priority: 10 }, "targetMismatch"],
    [ask(work.id), null], [ask("other"), "targetMismatch"],
    [{ kind: "ask", question: "Ready?", options: [{ label: "Ready", rationale: "Checks pass", effect: { kind: "prReview", responsibilityId: "other", headSha: "abcdef1", choice: "ready" } },
      { label: "Wait", rationale: "Not yet", effect: { kind: "reply" } }] }, "targetMismatch"],
    [{ kind: "open", target: "task", id: work.taskId }, null], [{ kind: "open", target: "task", id: "task-other" }, "targetMismatch"],
    [{ kind: "open", target: "workspace", id: work.executionWorkspaceId }, null], [{ kind: "open", target: "fleet" }, "targetMismatch"],
    [{ kind: "workspace", workspaceId: work.executionWorkspaceId, operation: "addTodo", text: "Check" }, null],
    [{ kind: "workspace", workspaceId: "source", operation: "addTodo", text: "Check" }, "targetMismatch"],
    [{ kind: "bulkControl", operation: "pause", scope: { kind: "ids", ids: [work.id] } }, null],
    [{ kind: "bulkControl", operation: "pause", scope: { kind: "all" } }, "targetMismatch"],
    [{ kind: "cleanup", scope: { kind: "ids", ids: [work.id, "other"] }, deleteBranches: false, permanentlyDeleteArchived: false }, "targetMismatch"],
    [{ kind: "cleanup", scope: { kind: "repository", repositoryPath: "/tmp/project" }, deleteBranches: false, permanentlyDeleteArchived: false }, "targetMismatch"],
    [{ kind: "clear", scopes: ["conversation"] }, "targetMismatch"],
    [{ kind: "schedule", operation: "list" }, "targetMismatch"],
    [{ kind: "delegate", workspaceId: "source", title: "New", instruction: "Do it", acceptanceCriteria: ["Done"], priority: 50 }, "targetMismatch"],
    [{ kind: "withdraw", decisionId: "confirm:m1:0" }, null, pauseSelected],
    [{ kind: "withdraw", decisionId: "ask:m1:0" }, "targetMismatch", ask("other")],
    [{ kind: "withdraw", decisionId: "confirm:m1:0" }, "targetMismatch"],
  ];
  for (const [action, expected, withdrawn] of cases) expect([action.kind, verdict(action, withdrawn ?? null)]).toEqual([action.kind, expected]);
  // A row that is not the selected identity is never substituted for it.
  expect(tarsSelectedWorkRefusal(target, pauseSelected, { ...work, id: "other" })?.reason).toBe("targetUnavailable");
});

test("the host keeps newer action kinds on the selected work and leaves unselected messages unchanged", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("running");
    const other = f.responsibility("running");
    const send = async (requestId: string, actions: TarsDecisionAction[], selected = true) => {
      f.replies.push({ reply: requestId, actions });
      const message = f.service.sendMessage({ requestId, text: "Handle this work", ...(selected ? { target: { responsibilityId: row.id } } : {}) });
      await f.service.whenIdle();
      return f.conversations.listReceipts(message.id).map(({ status, reason }) => [status, reason]);
    };
    f.service.start();
    // A reply carries at most one open, so each open goes in its own message.
    expect(await send("open-selected", [{ kind: "open", target: "task", id: row.taskId! },
      { kind: "workspace", workspaceId: "source", operation: "addTodo", text: "Check" },
      { kind: "bulkControl", operation: "pause", scope: { kind: "all" } },
      { kind: "cleanup", scope: { kind: "ids", ids: [row.id] }, deleteBranches: false, permanentlyDeleteArchived: false },
      { kind: "clear", scopes: ["conversation"] },
      { kind: "schedule", operation: "list" }])).toEqual([
      ["applied", null], ["rejected", "targetMismatch"], ["rejected", "targetMismatch"], ["proposed", null], ["rejected", "targetMismatch"], ["rejected", "targetMismatch"],
    ]);
    expect(await send("open-other", [{ kind: "open", target: "task", id: other.taskId! }])).toEqual([["rejected", "targetMismatch"]]);
    expect(await send("open-fleet", [{ kind: "open", target: "fleet" }])).toEqual([["rejected", "targetMismatch"]]);
    expect(await send("unselected", [{ kind: "open", target: "fleet" }, { kind: "clear", scopes: ["conversation"] }], false)).toEqual([["applied", null], ["proposed", null]]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(2);
    expect(f.runControls).toEqual([]);
  } finally { await f.close(); }
});

test("a selected withdraw closes only a waiting decision about the selected work", async () => {
  const f = followUpFixture();
  try {
    const row = f.responsibility("running");
    const other = f.responsibility("running");
    const ask = (responsibilityId: string, revision: number): TarsDecisionAction => ({ kind: "ask", question: "Pause it?", options: [
      { label: "Pause", rationale: "Stop it now", effect: { kind: "control", responsibilityId, expectedRevision: revision, operation: "pause" } },
      { label: "Keep going", rationale: "Leave it", effect: { kind: "reply" } }] });
    f.replies.push({ reply: "A question", actions: [ask(other.id, other.revision)] });
    f.service.start();
    const asked = f.service.sendMessage({ requestId: "asked", text: "Should I pause the other release?" });
    await f.service.whenIdle();
    expect(f.conversations.listReceipts(asked.id)[0]?.status).toBe("proposed");
    f.replies.push({ reply: "Withdrawn", actions: [{ kind: "withdraw", decisionId: tarsAskDecisionId(asked.id, 0) }] });
    const withdrawing = f.service.sendMessage({ requestId: "withdrawing", text: "Never mind that question", target: { responsibilityId: row.id } });
    await f.service.whenIdle();
    expect(f.conversations.listReceipts(withdrawing.id)[0]).toMatchObject({ status: "rejected", reason: "targetMismatch" });
    expect(f.conversations.listReceipts(asked.id)[0]?.status).toBe("proposed");
  } finally { await f.close(); }
});
