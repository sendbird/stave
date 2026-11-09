import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { TarsCardActions, TarsTray, type TarsTrayActions } from "../src/components/tars/TarsTray";
import { TarsActionRecordLine } from "../src/components/tars/TarsActionRecordLine";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { buildTarsTray, tarsCardActions } from "../src/lib/tars/tray-model";
import type { TarsActionRecord, TarsQueueMove, TarsQueueMoveSource } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";

const start = new Date("2026-11-05T00:00:00.000Z");
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
afterEach(() => applyAppLocale("en"));

/** The tray fixtures plus three queued pieces of work behind the running fix. */
function queueFixtures() {
  const f = buildTarsTrayFixtures(start);
  const queued = (id: string, title: string, priority: number, minutes: number): TarsResponsibility => ({ ...f.responsibilities[1]!, id, requestId: `request-${id}`, title,
    state: "queued", priority, branchName: undefined, agentId: null, taskId: null, agentRunId: null, executionWorkspaceId: null, createdAt: at(minutes), updatedAt: at(minutes) });
  // A high-priority queued card sorts above the running ones in the snapshot; the lane still shows it after them.
  const responsibilities = [queued("auth", "Rotate the staging auth keys", 90, 2), ...f.responsibilities, queued("search", "Speed up the search index", 50, 3),
    queued("docs", "Refresh the API reference", 50, 4)];
  return buildTarsTray({ responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
}

/** Element-tree handlers by accessible name, including an open "More actions" menu's items. */
function handlersOf(render: () => ReactNode) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = render(); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  const handlers = new Map<string, () => void>();
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as { children?: ReactNode; grip?: ReactNode; onClick?: () => void; "aria-label"?: string; groups?: Array<{ items: Array<{ label: string; onSelect: () => void }> }> };
    if (props.onClick && props["aria-label"]) handlers.set(props["aria-label"], props.onClick);
    for (const item of props.groups?.flatMap((group) => group.items) ?? []) handlers.set(item.label, item.onSelect);
    visit(props.grip);
    visit(props.children);
  };
  visit(sink.tree);
  return { html, handlers };
}

const record = (patch: Partial<TarsActionRecord>): TarsActionRecord => ({ requestId: "move-1", source: "click", requestHash: "d".repeat(64),
  action: { kind: "move", responsibilityId: "docs", expectedRevision: 2, move: { direction: "earlier" } }, status: "applied", error: null, reason: null,
  priority: 70, revision: 2, createdAt: at(5), updatedAt: at(5), ...patch } as TarsActionRecord);

describe("queue priority controls", () => {
  test("started work leads the lane and queued work follows in the order it will start, each knowing its place", () => {
    const tray = queueFixtures();
    const running = tray.lanes.running.map((card) => [card.row.id, card.queue]);
    expect(running).toEqual([["billing", null], ["migration", null],
      ["auth", { position: 1, total: 3 }], ["search", { position: 2, total: 3 }], ["docs", { position: 3, total: 3 }]]);
  });

  test("a queued card's menu leads with Do first and Do later where they apply; started work offers neither", () => {
    const tray = queueFixtures();
    const moves = (id: string) => tarsCardActions(tray.lanes.running.find((card) => card.row.id === id)!).more
      .flatMap((action) => action.kind === "move" ? [action.direction] : []);
    expect(moves("auth")).toEqual(["later"]);
    expect(moves("search")).toEqual(["earlier", "later"]);
    expect(moves("docs")).toEqual(["earlier"]);
    expect(moves("billing")).toEqual([]);
    expect(tarsCardActions(tray.lanes.running.find((card) => card.row.id === "search")!).more[0]).toEqual({ kind: "move", direction: "earlier" });
  });

  test("Do first and Do later go through the host move path as a click; a bridge without it offers neither", () => {
    const tray = queueFixtures();
    const card = tray.lanes.running.find((entry) => entry.row.id === "search")!;
    const moves: Array<[string, TarsQueueMove, TarsQueueMoveSource]> = [];
    const actions: TarsTrayActions = { busy: false, onAct() {}, onConfirm() {}, onOpenTask() {}, onShowInFleet() {},
      onMove: (row, move, source) => moves.push([row.id, move, source]) };
    const { handlers } = handlersOf(() => TarsCardActions({ card, actions }));
    handlers.get("Do first")!();
    handlers.get("Do later")!();
    expect(moves).toEqual([["search", { direction: "earlier" }, "click"], ["search", { direction: "later" }, "click"]]);
    const without = handlersOf(() => TarsCardActions({ card, actions: { ...actions, onMove: undefined } }));
    expect(without.handlers.has("Do first")).toBe(false);
    expect(without.handlers.has("Do later")).toBe(false);
  });

  test("queued cards carry a labelled grip with its keys only when there is something to reorder with", async () => {
    const tray = queueFixtures();
    const actions: TarsTrayActions = { busy: false, onAct() {}, onConfirm() {}, onOpenTask() {}, onShowInFleet() {}, onMove() {} };
    const html = renderToStaticMarkup(createElement(TarsTray, { model: tray, actions }));
    expect((html.match(/data-tars-queue-grip=/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-label="Reorder Speed up the search index"');
    expect(html).toContain('aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"');
    expect(html).not.toContain('data-tars-queue-grip="billing"');
    // Without the host's move path there is no grip.
    expect(renderToStaticMarkup(createElement(TarsTray, { model: tray, actions: { ...actions, onMove: undefined } }))).not.toContain("data-tars-queue-grip");
    await applyAppLocale("ko");
    const ko = renderToStaticMarkup(createElement(TarsTray, { model: tray, actions }));
    expect(ko).toContain('aria-label="Speed up the search index 순서 바꾸기"');
  });

  test("a move leaves one record line with how it was asked and the new priority; a refusal says why", async () => {
    const html = (value: TarsActionRecord, title = "Refresh the API reference") => renderToStaticMarkup(createElement(TarsActionRecordLine, { record: value, title }));
    expect(html(record({}))).toContain("Moved earlier · click");
    expect(html(record({}))).toContain("Priority 70");
    expect(html(record({ source: "drag", action: { kind: "move", responsibilityId: "docs", expectedRevision: 2, move: { direction: "later", relativeTo: "auth" } } })))
      .toContain("Moved later · drag");
    const refused = html(record({ status: "rejected", error: "Edge.", reason: "queueEdge", priority: undefined }));
    expect(refused).toContain("Do first not applied · click");
    expect(refused).toContain("This work is already at that end of the queue.");
    expect(refused).not.toContain("Priority");
    await applyAppLocale("ko");
    expect(html(record({}))).toContain("먼저 하기 적용됨 · 클릭");
    expect(html(record({}))).toContain("우선순위 70");
    expect(html(record({ action: { kind: "move", responsibilityId: "docs", expectedRevision: 2, move: { direction: "later" } } }))).toContain("나중에 하기 적용됨 · 클릭");
  });
});
