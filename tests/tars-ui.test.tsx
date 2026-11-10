import { describe, expect, test } from "bun:test";
import { tarsRecordText } from "./tars-record-text";
import { Database } from "bun:sqlite";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarsView } from "../src/components/tars/TarsView";
import { TarsCardActions, TarsTrayCard } from "../src/components/tars/TarsTray";
import { buildTarsTray } from "../src/lib/tars/tray-model";
import { TarsActionRecordLine, TarsConversation, TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { applyAppLocale, i18n } from "@/i18n";
import { createTarsRequestQueue } from "../src/components/tars/use-tars";
import type { TarsConversationState } from "../src/components/tars/use-tars-conversation";
import { createAppSurfaceActions, normalizeAppActiveSurface, TARS_APP_SURFACE, type AppActiveSurface } from "../src/store/app-surface";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { TarsConversationSchema, type TarsActionRecord, type TarsControlOperation, type TarsDecisionAnswer, type TarsMessage } from "../src/lib/tars/conversation";
import { projectTarsDecisions, type TarsDecisionView } from "../src/lib/tars/decisions";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";

const row: TarsResponsibility = { id: "goal", requestId: "request", title: "Verified result", instruction: "Work", acceptanceCriteria: ["Actual checks pass"], workspaceId: "ws", executionWorkspaceId: null, repositoryPath: "/tmp/repo", providerId: "codex", model: null, priority: 50, maxTurns: 30, revision: 1, state: "running", detail: null, taskId: "task", agentRunId: "run", reverifyAfter: null, createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z" };
/** The tray card for one responsibility, wired to the given control handler as TarsView wires the host path. */
const rowProps = (value: TarsResponsibility, onAct: (operation: TarsControlOperation) => void = () => {}) => ({
  card: buildTarsTray({ responsibilities: [value], attentionItems: [], runs: {} }).lanes[value.state === "completed" || value.state === "cancelled" ? "done" : "running"][0]!,
  actions: { busy: false, onAct: (_row: TarsResponsibility, operation: TarsControlOperation) => onAct(operation), onConfirm() {}, onOpenTask() {}, onShowInFleet() {} },
});

/**
 * Render the card, and keep its actions' element tree so a test can press a real handler without a DOM:
 * the visible buttons first, then the items of the "More actions" menu.
 */
function renderRow(props: ReturnType<typeof rowProps>) {
  const html = renderToStaticMarkup(createElement(TarsTrayCard, props));
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = TarsCardActions(props); return sink.tree; }
  renderToStaticMarkup(createElement(Capture));
  const buttons: Array<{ label: string; onClick: () => void; menu: boolean }> = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const elementProps = node.props as { children?: ReactNode; onClick?: () => void; groups?: Array<{ items: Array<{ label: string; onSelect: () => void }> }> };
    if (elementProps.onClick && typeof elementProps.children === "string") buttons.push({ label: elementProps.children, onClick: elementProps.onClick, menu: false });
    for (const item of elementProps.groups?.flatMap((group) => group.items) ?? []) buttons.push({ label: item.label, onClick: item.onSelect, menu: true });
    visit(elementProps.children);
  };
  visit(sink.tree);
  return { html, labels: buttons.map((button) => button.label), visible: buttons.filter((button) => !button.menu).map((button) => button.label),
    press: (label: string) => buttons.find((button) => button.label === label)!.onClick() };
}

describe("Tars UI", () => {
  test("a missing bridge states desktop availability instead of faking empty work", () => {
    const html = renderToStaticMarkup(createElement(TarsView));
    expect(html).toContain("Talking with Tars needs a recent version of the Stave desktop app.");
    expect(html).not.toContain("Delegate and start");
  });
  test("terminal responsibility keeps its task and Fleet row without active controls", () => {
    const done = renderRow(rowProps({ ...row, state: "completed" }));
    expect(done.visible).toEqual(["Open task"]);
    expect(done.labels).toEqual(["Open task", "Show in Fleet"]);
    expect(done.html).toContain('data-tars-lane="done"');
    expect(done.html).not.toContain("Cancel work");
  });
  test("queued transport reads finish before mutations and failure does not poison later requests", async () => {
    const queue = createTarsRequestQueue();
    const events: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const read = queue(async () => { events.push("read-start"); await blocked; events.push("read-end"); });
    const mutation = queue(async () => { events.push("mutation"); throw new Error("transport"); });
    const next = queue(async () => events.push("fresh-read"));
    await Promise.resolve();
    expect(events).toEqual(["read-start"]);
    release(); await read; await expect(mutation).rejects.toThrow("transport"); await next;
    expect(events).toEqual(["read-start", "read-end", "mutation", "fresh-read"]);
  });
  test("global navigation persists, closes only itself and returns to workspace", () => {
    let state: { activeAppSurface: AppActiveSurface } = { activeAppSurface: { kind: "workspace" } };
    const actions = createAppSurfaceActions((update) => { state = { ...state, ...update(state) }; });
    actions.openTars(); expect(state.activeAppSurface).toBe(TARS_APP_SURFACE);
    expect(normalizeAppActiveSurface({ kind: "tars" })).toBe(TARS_APP_SURFACE);
    actions.openAgents(); actions.closeTars(); expect(state.activeAppSurface.kind).toBe("agents");
    actions.openTars(); actions.closeTars(); expect(state.activeAppSurface.kind).toBe("workspace");
  });
  test("controls follow ownership: take over while Tars owns it, hand back after you took over", () => {
    // One main action and Open task stay visible; the rest is in "More actions", Cancel last.
    const running = renderRow(rowProps(row));
    expect(running.visible).toEqual(["Pause", "Open task"]);
    expect(running.labels).toEqual(["Pause", "Open task", "Take over", "Show in Fleet", "Cancel work"]);
    expect(renderRow(rowProps({ ...row, state: "paused" })).labels).toEqual(["Resume", "Open task", "Take over", "Show in Fleet", "Cancel work"]);
    const owned = renderRow(rowProps({ ...row, state: "takenOver" }));
    expect(owned.labels).toEqual(["Hand back", "Open task", "Show in Fleet", "Cancel work"]);
    expect(owned.html).toContain("Taken over");
    expect(owned.html).toContain("Owner: you");
    expect(renderRow(rowProps({ ...row, reverifyAfter: "2026-11-05T00:05:00.000Z" })).html).toContain("verify this work again");
  });
  test("a click produces a one-line action record in the timeline and no user message", async () => {
    const database = new Database(":memory:");
    const store = new TarsStore(database); const conversations = new TarsConversationStore(database);
    const runControls: string[] = [];
    const runtime = createTarsRuntime({ store, now: () => "2026-11-05T00:01:00.000Z", validateScope: async () => {}, prepareWorkspace: async () => "execution",
      prepareTask: async () => {}, findRun: async () => null, startRun: async () => "run", observe: async () => ({ state: "running", detail: null }),
      controlRun: async (_row, operation) => { runControls.push(operation); } });
    const created = store.create({ requestId: "owned", title: "Verified result", instruction: "Work", acceptanceCriteria: ["Actual checks pass"],
      workspaceId: "ws", repositoryPath: "/tmp/repo", providerId: "codex" }, "2026-11-05T00:00:00.000Z");
    const owned = store.patch(created.id, created.revision, { state: "running", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run" }, "2026-11-05T00:00:00.000Z");
    const clicks: Promise<unknown>[] = [];
    // The card's own Pause handler feeds the desktop click path (source "click"), as TarsView wires it.
    renderRow(rowProps(owned, (operation) => { clicks.push(actTars({ requestId: "click-1", responsibilityId: owned.id, expectedRevision: owned.revision,
      operation, source: "click" }, { conversations, runtime })); })).press("Pause");
    await Promise.all(clicks); await runtime.drain();
    expect(store.get(owned.id)?.state).toBe("paused");
    expect(runControls).toEqual(["pause"]);
    const conversation = TarsConversationSchema.parse({ settings: null, activity: [], messages: conversations.list(), receipts: [], records: conversations.listActions() });
    const state = { conversation, error: null, busy: false, available: true, refresh: async () => {}, send: async () => null, configure: async () => null, cancel: async () => null } as unknown as TarsConversationState;
    const html = renderToStaticMarkup(createElement(TarsConversation, { state, name: "Tars", titleOf: () => owned.title,
      initialSettings: { providerId: "codex", model: "test-model", maxTurns: 30 } }));
    expect(html).toContain('data-tars-action-record="applied"');
    expect(tarsRecordText(html)).toContain("Pause Verified result Applied");
    expect(html).toContain('aria-label="You did this in Tars"');
    expect(html).toContain("Verified result");
    expect(html).not.toContain("data-tars-message");
    expect(conversation.messages).toEqual([]);
    runtime.stop(); database.close();
  });
  test("refusals show the translated reason by code, never the host's English diagnostic", async () => {
    const at = "2026-11-05T00:00:00.000Z";
    const diagnostic = "Host diagnostic that must stay out of the interface.";
    const action = { kind: "control" as const, responsibilityId: "goal", expectedRevision: 1, operation: "resume" as const };
    const record = (reason: string | null): TarsActionRecord => ({ requestId: "click", source: "click", requestHash: "e".repeat(64), action,
      status: "rejected", error: diagnostic, reason: reason as TarsActionRecord["reason"], revision: 2, createdAt: at, updatedAt: at });
    const line = (reason: string | null) => renderToStaticMarkup(createElement(TarsActionRecordLine, { record: record(reason) }));
    const message: TarsMessage = { id: "message", requestId: "request", text: "계속해", providerId: "codex", model: "test-model", maxTurns: 30, revision: 2,
      state: "answered", reply: "Resuming.", decision: { reply: "Resuming.", actions: [action] }, error: null, createdAt: at, updatedAt: at };
    const spoken = (reason: string | null) => renderToStaticMarkup(createElement(TarsConversationMessage, { message, name: "Tars", busy: false, onCancel() {},
      receipts: [{ messageId: "message", actionIndex: 0, requestHash: "f".repeat(64), action, status: "rejected", responsibilityId: null,
        error: diagnostic, reason: reason as TarsActionRecord["reason"], revision: 2, createdAt: at, updatedAt: at }] }));
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    try {
      expect(line("takenOver")).toContain("직접 맡은 작업입니다. Tars가 처리하려면 먼저 다시 맡기세요.");
      expect(tarsRecordText(line("takenOver"))).toContain("재개 적용하지 않음");
      expect(line("takenOver")).toContain('aria-label="Tars에서 직접 한 일입니다"');
      expect(line("stale")).toContain("마지막으로 확인한 뒤 작업이 바뀌었습니다.");
      // A code this build does not know, or none, falls back to the generic translated reason.
      expect(line("futureReason")).toContain("Tars가 이 동작을 하지 못했습니다.");
      expect(spoken("ownershipLost")).toContain("이 작업을 이제 다른 곳에서 맡고 있어");
      expect(spoken(null)).toContain("Tars가 이 동작을 하지 못했습니다.");
      for (const html of [line("takenOver"), line("futureReason"), spoken("ownershipLost"), spoken(null)]) expect(html).not.toContain(diagnostic);
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
    expect(line("stale")).toContain("This work changed after you last saw it.");
  });
  test("a proposed control is one decision card with the responsibility title and one Confirm, which folds once confirmed", () => {
    const at = "2026-11-05T00:00:00.000Z";
    const action = { kind: "control" as const, responsibilityId: "goal", expectedRevision: 3, operation: "handBack" as const };
    const message: TarsMessage = { id: "message", requestId: "request", text: "다시 맡아줘", providerId: "codex", model: "test-model", maxTurns: 30, revision: 2,
      state: "answered", reply: "Confirm to hand it back.", decision: { reply: "Confirm to hand it back.", actions: [action] }, error: null, createdAt: at, updatedAt: at };
    const receipt = { messageId: "message", actionIndex: 0, requestHash: "a".repeat(64), action, status: "proposed" as const, responsibilityId: null,
      error: null, reason: null, revision: 2, createdAt: at, updatedAt: at };
    const owner = { ...row, state: "takenOver" as const, revision: 3 };
    const views = (answers: TarsDecisionAnswer[] = []) => projectTarsDecisions({ messages: [message], receipts: [receipt], records: [], answers, activity: [], responsibilities: [owner] });
    const answered: unknown[] = [];
    const sink: { tree: ReactNode } = { tree: null };
    const props = { message, receipts: [receipt], name: "Tars", busy: false, onCancel() {}, titleOf: () => "Verified result", decisions: views(),
      onAnswer: (decision: TarsDecisionView, index: number, source: string) => { answered.push([decision.id, index, source]); } };
    function Capture() { sink.tree = TarsConversationMessage(props); return sink.tree; }
    const html = renderToStaticMarkup(createElement(Capture));
    // The button says it waits, named by what it does; there is no waiting badge.
    expect(html).not.toContain("Awaiting your confirmation");
    expect(html).toMatch(/data-tars-decision-option="0"[^>]*>(?:(?!<\/button>).)*Hand back/);
    expect(html).toContain("Hand this work back to Tars?");
    expect(html).toContain("Verified result");
    expect(html).not.toContain("Hand back goal");
    expect(html).toContain('data-tars-decision-state="waiting"');
    const find = (node: ReactNode): (() => void) | null => {
      if (Array.isArray(node)) { for (const child of node) { const found = find(child); if (found) return found; } return null; }
      if (!isValidElement(node)) return null;
      const elementProps = node.props as { children?: ReactNode; onClick?: () => void; decision?: TarsDecisionView; onAnswer?: (d: TarsDecisionView, i: number, s: string) => void };
      // The card renders the button; its answer handler is what the button calls with "click".
      if (elementProps.decision && elementProps.onAnswer) return () => elementProps.onAnswer!(elementProps.decision!, 0, "click");
      return find(elementProps.children);
    };
    find(sink.tree)!();
    expect(answered).toEqual([["confirm:message:0", 0, "click"]]);
    // Once answered, the card folds to its one-line record and offers no Confirm.
    const answer: TarsDecisionAnswer = { decisionId: "confirm:message:0", optionIndex: 0, source: "click", effect: { kind: "control", ...action }, label: null,
      status: "applied", reason: null, error: null, actRequestId: "confirm:message:0", messageId: null, revision: 2, createdAt: at, updatedAt: at };
    const folded = renderToStaticMarkup(createElement(TarsConversationMessage, { ...props, decisions: views([answer]) }));
    expect(tarsRecordText(folded)).toContain("Hand back Verified result Confirmed");
    expect(folded).not.toContain(">Confirm<");
  });
});
