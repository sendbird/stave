import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetTaskTableView } from "@/components/layout/FleetTaskTable";
import { applyAppLocale } from "@/i18n";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import { nextFleetTaskSort, sortFleetTaskRows } from "@/lib/fleet/task-table-sort";
import type { Task } from "@/types/chat";

const NOW = Date.parse("2026-10-22T02:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function row(id: string, patch: Partial<FleetTaskRow> & { title?: string; updatedMinutesAgo?: number } = {}): FleetTaskRow {
  const { title, updatedMinutesAgo, ...rest } = patch;
  return {
    key: id, repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: `ws-${id}`, workspaceName: `ws-${id}`,
    workspaceBranch: null, workspaceActivity: "idle",
    task: { id, title: title ?? id, provider: "codex", updatedAt: minutesAgo(updatedMinutesAgo ?? 1) } as Task,
    status: "idle", need: null, waitingSince: null, activeTurnId: null, rank: 9 as FleetTaskRow["rank"],
    ...rest,
  };
}
const need = (kind: FleetAttentionItem["kind"]) => ({ kind } as FleetAttentionItem);
const keys = (rows: readonly FleetTaskRow[]) => rows.map((entry) => entry.key);
const options = { nowMs: NOW, untitled: "Untitled" };

describe("fleet table sort", () => {
  test("a header press cycles ascending, descending, then the table's own order", () => {
    let sort = nextFleetTaskSort(null, "waiting");
    expect(sort).toEqual({ key: "waiting", direction: "ascending" });
    sort = nextFleetTaskSort(sort, "waiting");
    expect(sort).toEqual({ key: "waiting", direction: "descending" });
    expect(nextFleetTaskSort(sort, "waiting")).toBeNull();
    // Another column starts its own cycle.
    expect(nextFleetTaskSort(sort, "task")).toEqual({ key: "task", direction: "ascending" });
  });

  test("unsorted keeps the lane order the rows came in", () => {
    const rows = [row("c"), row("a"), row("b")];
    expect(sortFleetTaskRows(rows, null, options)).toBe(rows);
  });

  test("waiting orders by how long each wait has run; rows that are not waiting stay last both ways", () => {
    const rows = [row("none"), row("short", { waitingSince: minutesAgo(5) }), row("long", { waitingSince: minutesAgo(40) }), row("mid", { waitingSince: minutesAgo(20) })];
    expect(keys(sortFleetTaskRows(rows, { key: "waiting", direction: "descending" }, options))).toEqual(["long", "mid", "short", "none"]);
    expect(keys(sortFleetTaskRows(rows, { key: "waiting", direction: "ascending" }, options))).toEqual(["short", "mid", "long", "none"]);
  });

  test("ties keep the table's own order, so it is a stable sort", () => {
    const rows = [row("first", { status: "running" }), row("second", { status: "waiting-approval" }), row("third", { status: "running" }), row("fourth", { status: "waiting-approval" })];
    expect(keys(sortFleetTaskRows(rows, { key: "state", direction: "ascending" }, options))).toEqual(["second", "fourth", "first", "third"]);
    expect(keys(sortFleetTaskRows(rows, { key: "state", direction: "descending" }, options))).toEqual(["first", "third", "second", "fourth"]);
  });

  test("text columns compare in the display language, numbers by value", () => {
    applyAppLocale("en");
    const rows = [row("t2", { title: "task 10" }), row("t1", { title: "Task 9" }), row("t3", { title: "alpha" })];
    expect(keys(sortFleetTaskRows(rows, { key: "task", direction: "ascending" }, options))).toEqual(["t3", "t1", "t2"]);
    const needs = [row("n1", { need: need("question") }), row("n2"), row("n3", { need: need("approval") })];
    expect(keys(sortFleetTaskRows(needs, { key: "needs", direction: "ascending" }, options))).toEqual(["n3", "n1", "n2"]);
    const activity = [row("old", { updatedMinutesAgo: 30 }), row("new", { updatedMinutesAgo: 1 })];
    expect(keys(sortFleetTaskRows(activity, { key: "activity", direction: "descending" }, options))).toEqual(["new", "old"]);
  });

  test("every header is a sort button that states aria-sort, none until pressed", () => {
    applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(FleetTaskTableView, { rows: [row("a"), row("b")], nowMs: NOW, onOpenTask: () => {} }));
    expect(html.match(/aria-sort="none"/g)).toHaveLength(7);
    expect(html.match(/data-table-sort="none"/g)).toHaveLength(7);
    expect(html).toContain(">Waiting</span>");
  });
});
