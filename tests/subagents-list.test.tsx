import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SubagentsList, type SubagentListItem } from "@/components/session/SubagentsList";
import { resolveSubagentsTabMark } from "@/components/session/task-panel-marks";
import { fromDelegatedTask, fromWorkGraphNode, type DelegationExchange } from "@/lib/delegation/exchange";
import { countSubagentList, orderSubagentList, subagentNeedsUser } from "@/lib/delegation/subagent-list";
import { selectTaskSubagents } from "@/lib/delegation/subagent-summary";
import type { DelegatedTaskBlockedKind } from "@/lib/runs/delegated-task-view";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { AgentNode } from "@/lib/work-graph/work-graph.types";
import type { ChatMessage } from "@/types/chat";

const T0 = Date.parse("2026-10-22T10:00:00.000Z");
const MINUTE = 60_000;
const at = (minutes: number) => new Date(T0 + minutes * MINUTE).toISOString();

function delegated(
  key: string,
  phase: DelegatedTaskSummary["phase"],
  timing: { started: number; ended?: number },
  blockedKind: DelegatedTaskBlockedKind | null = null,
): DelegationExchange {
  return fromDelegatedTask({
    runId: `child-task:parent:${key}`, stepId: `child-task:parent:${key}:turn`, parentTaskId: "parent", delegationKey: key,
    delegatedTaskId: `task-${key}`, delegatedWorkspaceId: "w", delegatedTurnId: `turn-${key}`, providerId: "codex",
    lifecycle: "one-turn", phase, reason: phase === "failed" ? "The build broke." : null, attempt: 1,
    createdAt: at(timing.started), updatedAt: at(timing.ended ?? timing.started),
    completedAt: timing.ended === undefined ? null : at(timing.ended), result: phase === "completed" ? "Done." : null,
  } as DelegatedTaskSummary, { blockedKind });
}

function subagent(key: string, status: AgentNode["status"], timing: { started: number; ended?: number }): DelegationExchange {
  return fromWorkGraphNode({
    key, identitySource: "provider", parentKey: null, label: key, status, progress: [],
    startedAt: T0 + timing.started * MINUTE, updatedAt: T0 + (timing.ended ?? timing.started) * MINUTE,
    ...(timing.ended === undefined ? {} : { completedAt: T0 + timing.ended * MINUTE }),
  } as AgentNode);
}

/** Oldest first, as `selectTaskSubagents` hands rows over. */
function sampleRows() {
  return [
    subagent("explorer", "running", { started: 0 }),
    delegated("review", "completed", { started: 1, ended: 5 }),
    subagent("planner", "failed", { started: 2, ended: 3 }),
    delegated("writer", "running", { started: 4 }, "user-input"),
    delegated("migrate", "failed", { started: 6, ended: 8 }),
    delegated("docs", "running", { started: 7 }),
  ];
}

describe("subagent list order and counts", () => {
  test("children that need the user lead: an open ask, then a failed delegated task", () => {
    const ordered = orderSubagentList(sampleRows()).map((row) => row.ref.delegationKey ?? row.ref.nodeKey);
    expect(ordered).toEqual(["writer", "migrate", "explorer", "docs", "planner", "review"]);
  });

  test("an in-turn subagent's failure is the calling turn's to report, not the user's", () => {
    const rows = sampleRows();
    expect(rows.filter(subagentNeedsUser).map((row) => row.ref.delegationKey)).toEqual(["writer", "migrate"]);
    expect(countSubagentList(rows)).toEqual({ needsYou: 2, running: 2, done: 1, failed: 1, stopped: 0 });
  });

  test("the tab mark says how many run and how many need you", () => {
    expect(resolveSubagentsTabMark({ running: 0, needsYou: 0 })).toBeNull();
    expect(resolveSubagentsTabMark({ running: 3, needsYou: 0 })).toEqual({ kind: "count", count: 3, text: "3", label: "3 running" });
    expect(resolveSubagentsTabMark({ running: 3, needsYou: 1 })).toEqual({
      kind: "count", count: 1, text: "3 · 1 needs you", label: "3 running, 1 needs you", attention: true,
    });
    expect(resolveSubagentsTabMark({ running: 0, needsYou: 2 })).toMatchObject({ text: "2 need you", label: "2 subagents need you" });
  });
});

describe("SubagentsList", () => {
  function render(rows: DelegationExchange[], opened: string[] = []) {
    const items: SubagentListItem[] = orderSubagentList(rows).map((exchange) => ({
      exchange,
      who: exchange.ref.delegationKey ?? exchange.title,
      what: exchange.ask,
      canStop: false,
      busy: false,
      onOpen: () => opened.push(exchange.ref.delegationKey ?? exchange.title),
    }));
    return renderToStaticMarkup(createElement(SubagentsList, { items, nowMs: T0 + 10 * MINUTE }));
  }

  test("the summary counts the children and opens the first one waiting on the user", () => {
    const html = render(sampleRows());
    expect(html).toContain("2 need you · 2 running · 1 done · 1 failed");
    expect(html).toMatch(/title="writer: [^"]+"[^>]*>.*Open writer/s);
    // The stopped child is first in the list too.
    expect(html.indexOf('data-needs-user="true"')).toBeLessThan(html.indexOf('data-subagent-kind="subagent"'));
  });

  test("every row says how long it ran: live rows to now, settled rows to their end", () => {
    const html = render(sampleRows());
    // explorer started at 0 and still runs at 10m; review took 4m and ended 5m ago.
    expect(html).toContain("Running · 10m");
    expect(html).toContain("Returned · 4m");
    expect(html).toContain(">5m ago</time>");
    // A failed delegated task reads as failed, with how long it ran.
    expect(html).toContain("Failed · 2m");
  });

  test("with nothing waiting on the user there is no open shortcut", () => {
    const html = render([subagent("explorer", "running", { started: 0 }), delegated("review", "completed", { started: 1, ended: 5 })]);
    expect(html).toContain("1 running · 1 done");
    expect(html).not.toContain("Open explorer");
    expect(html).not.toContain('data-needs-user="true"');
  });
});

describe("a child rebuilt from saved messages", () => {
  /**
   * An older turn whose work graph was not kept: the graph is rebuilt from the
   * message, which only knows when the message began, so its start and end
   * are the same stand-in instant and say nothing about how long it ran.
   */
  function rebuilt(elapsedSeconds?: number) {
    const messages = [{
      id: "assistant-old", role: "assistant", providerId: "claude-code", model: "claude-sonnet-5", content: "",
      turnId: "turn-old", startedAt: at(0), completedAt: at(20),
      parts: [{
        type: "tool_use", toolUseId: "tool-explore", toolName: "Task", state: "output-available",
        input: JSON.stringify({ description: "Explore the users router", prompt: "Map the router", subagent_type: "Explore" }),
        output: "The router lives in server/users.ts.",
        ...(elapsedSeconds === undefined ? {} : { elapsedSeconds }),
      }],
    }] as unknown as ChatMessage[];
    const rows = selectTaskSubagents({ messages, workGraph: null, includeSubagents: true });
    expect(rows).toHaveLength(1);
    const items: SubagentListItem[] = rows.map((exchange) => ({ exchange, who: exchange.title, what: exchange.ask, canStop: false, busy: false }));
    return renderToStaticMarkup(createElement(SubagentsList, { items, nowMs: T0 + 60 * MINUTE }));
  }

  test("says nothing about its time when no duration was measured", () => {
    const html = rebuilt();
    expect(html).toContain("Returned");
    expect(html).not.toMatch(/Returned · /);
    expect(html).not.toContain("<time");
  });

  test("shows the duration the provider measured, but no made-up end time", () => {
    const html = rebuilt(252);
    expect(html).toContain("Returned · 4m 12s");
    expect(html).not.toContain("<time");
  });
});
