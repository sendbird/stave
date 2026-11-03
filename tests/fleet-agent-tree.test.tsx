import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AgentFleet,
  describeAgentFleetTask,
  hasAgentFleetNumbers,
  moveAgentFleetFocus,
  resolveAgentFleetOpen,
  rollupAgentFleetCost,
  sizeAgentFleetCard,
  splitAgentFleetTools,
  summarizeAgentFleet,
  type AgentFleetAgent,
} from "@/components/ads/components/AgentFleet";
import { applyAppLocale } from "@/i18n";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import {
  buildFleetAgentFacts,
  buildMainAgent,
  buildSubagent,
  collectRecentToolNames,
  EMPTY_FLEET_AGENT_FACTS,
  mapExchangeStatus,
  mapFleetTaskRowStatus,
  mapFleetTaskStatus,
  shareFleetAgentFacts,
  sumReportedCostUsd,
} from "@/lib/fleet/agent-tree";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import type { FleetDisplayStatus } from "@/lib/fleet/task-status";
import type { ProviderTurnActivitySnapshot, ProviderTurnWorkItem } from "@/lib/providers/turn-status";
import { normalizeFleetBoardLayout } from "@/store/app-settings";
import { createAppStorePersistenceOptions } from "@/store/app-store-persistence";
import type { AppState } from "@/store/app-store.types";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, Task } from "@/types/chat";

const NOW = Date.parse("2026-11-03T02:00:00.000Z");

function row(overrides: Partial<FleetTaskRow> = {}): FleetTaskRow {
  const task = { id: "task-a", title: "Fix the search", provider: "claude-code", updatedAt: new Date(NOW).toISOString(), unread: false } as Task;
  return {
    key: "row-a", repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "ws-a", workspaceName: "search-fix",
    workspaceBranch: "search-fix", workspaceActivity: "live", task, status: "running", need: null, waitingSince: null,
    activeTurnId: "turn-a", rank: { lane: "running" } as FleetTaskRow["rank"], ...overrides,
  };
}

function workItem(id: string, toolName: string, updatedAt: number): ProviderTurnWorkItem {
  return { id, kind: "tool", status: "completed", title: toolName, toolName, progressMessages: [], startedAt: updatedAt, updatedAt } as ProviderTurnWorkItem;
}

function activity(items: ProviderTurnWorkItem[]): ProviderTurnActivitySnapshot {
  return {
    turnId: "turn-a", providerId: "claude-code", startedAt: NOW - 90_000, lastEventAt: NOW - 1_000, stalledAt: null,
    pendingInteraction: null, workItemsById: Object.fromEntries(items.map((item) => [item.id, item])),
    orderedWorkItemIds: items.map((item) => item.id),
  } as ProviderTurnActivitySnapshot;
}

function exchange(overrides: Partial<DelegationExchange> & { outcome: DelegationExchange["outcome"] }): DelegationExchange {
  return {
    id: "delegated-task:review", kind: "delegated-task", title: "review", identity: { role: "Subagent", providerId: "codex", model: "gpt-5.5" },
    ask: "Review the search change\nand report back", timing: { startedAt: NOW - 60_000, stages: [] }, actions: [], setup: {},
    ref: { delegationKey: "review", delegatedTaskId: "child-task", delegatedWorkspaceId: "child-ws" }, ...overrides,
  };
}

const agent = (overrides: Partial<AgentFleetAgent> & { id: string }): AgentFleetAgent => ({
  name: overrides.id, task: `${overrides.id} task`, status: "running", ...overrides,
});

describe("Fleet task status as a main agent", () => {
  test("maps every Fleet status, always with words", () => {
    const expected: Record<FleetDisplayStatus, ReturnType<typeof mapFleetTaskStatus>> = {
      running: { status: "running" },
      stalled: { status: "running", statusLabel: "No updates" },
      "waiting-input": { status: "waiting", statusLabel: "Needs you" },
      "waiting-approval": { status: "waiting", statusLabel: "Needs you" },
      error: { status: "failed" },
      idle: { status: "done" },
      unknown: { status: "queued", statusLabel: "Unknown" },
    };
    for (const [status, mapped] of Object.entries(expected)) {
      expect(mapFleetTaskStatus(status as FleetDisplayStatus)).toEqual(mapped);
    }
  });

  test("a task nobody opened waits on the user while a request for it is pending", () => {
    const need = (kind: FleetAttentionItem["kind"]) => ({ kind }) as FleetAttentionItem;
    expect(mapFleetTaskRowStatus({ status: "unknown", need: need("approval") })).toEqual({ status: "waiting", statusLabel: "Needs you" });
    expect(mapFleetTaskRowStatus({ status: "unknown", need: need("user-input") }).status).toBe("waiting");
    // Anything that is not a request for an answer keeps the status unknown.
    expect(mapFleetTaskRowStatus({ status: "unknown", need: need("run-failed") })).toEqual({ status: "queued", statusLabel: "Unknown" });
    expect(mapFleetTaskRowStatus({ status: "unknown", need: null }).status).toBe("queued");
    expect(mapFleetTaskRowStatus({ status: "running", need: need("approval") }).status).toBe("running");
  });

  test("a waiting or needs-you exchange status reads as waiting; one it does not know says Unknown", () => {
    const outcome = (status: string) => ({ outcome: { status } as DelegationExchange["outcome"] });
    for (const status of ["waiting", "needs_user", "needs-you"]) {
      expect(mapExchangeStatus(outcome(status))).toEqual({ status: "waiting" });
    }
    expect(mapExchangeStatus(outcome("paused-by-host"))).toEqual({ status: "queued", statusLabel: "Unknown" });
  });

  test("a delegation waiting on a person needs you; settled ends keep their own words", () => {
    expect(mapExchangeStatus({ outcome: { status: "running", needsUser: true } })).toEqual({ status: "waiting" });
    expect(mapExchangeStatus({ outcome: { status: "queued" } })).toEqual({ status: "queued" });
    expect(mapExchangeStatus({ outcome: { status: "returned" } })).toEqual({ status: "done" });
    expect(mapExchangeStatus({ outcome: { status: "failed" } })).toEqual({ status: "failed" });
    expect(mapExchangeStatus({ outcome: { status: "timed_out" } }).status).toBe("failed");
    expect(mapExchangeStatus({ outcome: { status: "cancelled" } })).toEqual({ status: "stopped", statusLabel: "Cancelled" });
    expect(mapExchangeStatus({ outcome: { status: "unresolved" } }).status).toBe("stopped");
  });
});

describe("cost", () => {
  test("sums what messages reported and never turns unknown into $0", () => {
    const message = (cost?: number) => ({ id: String(cost), role: "assistant", usage: cost === undefined ? undefined : { inputTokens: 1, outputTokens: 1, totalCostUsd: cost } }) as ChatMessage;
    expect(sumReportedCostUsd(undefined)).toBeNull();
    expect(sumReportedCostUsd([message(), message()])).toBeNull();
    const messages = [message(0.25), message(), message(0.5)];
    expect(sumReportedCostUsd(messages)).toBe(0.75);
    expect(sumReportedCostUsd(messages)).toBe(0.75);
  });

  test("a main card rolls up its own cost and every known descendant's", () => {
    expect(rollupAgentFleetCost({})).toBeNull();
    expect(rollupAgentFleetCost({ cost: 0.4 })).toBe(0.4);
    expect(rollupAgentFleetCost({ children: [agent({ id: "a" }), agent({ id: "b" })] })).toBeNull();
    expect(
      rollupAgentFleetCost({
        cost: 1,
        children: [agent({ id: "a", cost: 0.5 }), agent({ id: "b", children: [agent({ id: "c", cost: 0.25 })] }), agent({ id: "d" })],
      }),
    ).toBe(1.75);
  });

  test("totals count main agents and omit the cost when no one reported one", () => {
    const unknown = summarizeAgentFleet([
      agent({ id: "a", status: "running" }),
      agent({ id: "b", status: "waiting", children: [agent({ id: "b1", status: "running" })] }),
      agent({ id: "c", status: "done" }),
    ]);
    expect(unknown).toEqual({ agents: 3, running: 1, waiting: 1, cost: null });
    expect(summarizeAgentFleet([agent({ id: "a", cost: 0.1, children: [agent({ id: "a1", cost: 0.2 })] }), agent({ id: "b" })]).cost).toBeCloseTo(0.3);
  });
});

describe("main agents from task rows", () => {
  afterEach(() => applyAppLocale("en"));

  test("reads tools, live start and the latest work, in that order of preference for the task line", () => {
    const live = activity([workItem("1", "Read", NOW - 5_000), workItem("2", "Bash", NOW - 3_000), workItem("3", "Read", NOW - 1_000)]);
    expect(collectRecentToolNames(live)).toEqual(["Read", "Bash"]);
    const facts = buildFleetAgentFacts({ activity: live, messages: undefined });
    const main = buildMainAgent(row(), facts);
    expect(main).toMatchObject({ id: "row-a", name: "Fix the search", status: "running", startedAt: NOW - 90_000, tools: [{ id: "Read", name: "Read" }, { id: "Bash", name: "Bash" }], task: "Read" });
    expect("cost" in main).toBe(false);
    expect(main.model).toBe("Claude");
  });

  test("without reported work the task line says what the task needs, then where it lives", () => {
    const need = { kind: "approval", detail: "Run the focused tests" } as FleetAttentionItem;
    expect(buildMainAgent(row({ status: "waiting-approval", need }), EMPTY_FLEET_AGENT_FACTS).task).toBe("Approval · Run the focused tests");
    const idle = buildMainAgent(row({ status: "idle", activeTurnId: null }), { ...EMPTY_FLEET_AGENT_FACTS, startedAt: NOW, cost: 0.42 });
    expect(idle).toMatchObject({ task: "search-fix", status: "done", cost: 0.42 });
    expect("startedAt" in idle).toBe(false);
  });

  test("facts equal to the last ones keep their references", () => {
    const first = { a: buildFleetAgentFacts({ activity: activity([workItem("1", "Read", NOW)]), messages: undefined }) };
    const again = { a: buildFleetAgentFacts({ activity: activity([workItem("1", "Read", NOW)]), messages: undefined }) };
    expect(shareFleetAgentFacts(first, again)).toBe(first);
    const moved = { a: buildFleetAgentFacts({ activity: activity([workItem("2", "Edit", NOW)]), messages: undefined }) };
    expect(shareFleetAgentFacts(first, moved)).not.toBe(first);
  });
});

describe("subagents from delegation exchanges", () => {
  test("a delegated task that waits offers Answer, a failed one Open, and neither lists steps", () => {
    const waiting = buildSubagent(exchange({ outcome: { status: "running", needsUser: true, progress: ["Needs approval"] } }), NOW);
    expect(waiting).toMatchObject({ name: "review", status: "waiting", resolveLabel: "Answer", task: "Review the search change", startedAt: NOW - 60_000 });
    expect(waiting.ask).toContain("Review the search change");
    expect(waiting.steps).toBeUndefined();
    const failed = buildSubagent(exchange({ outcome: { status: "failed", error: "Tests failed", spend: { totalCostUsd: 0.12 } }, timing: { startedAt: NOW - 60_000, endedAt: NOW - 20_000, stages: [] } }), NOW);
    expect(failed).toMatchObject({ status: "failed", resolveLabel: "Open", error: "Tests failed", cost: 0.12, elapsedMs: 40_000 });
  });

  test("a task line that only repeats the name is left out", () => {
    // The ledger keeps no prompt, so the delegated task's ask is the "Subagent <key>" stand-in.
    const standIn = buildSubagent(
      exchange({ title: "docs-pass", ask: "Subagent docs-pass", ref: { delegationKey: "docs-pass" }, outcome: { status: "queued" } }),
      NOW,
    );
    expect(standIn.name).toBe("docs-pass");
    expect("task" in standIn).toBe(false);
    // A work-graph subagent's title is "<badge> · <label>" and its ask the label.
    const explore = buildSubagent(
      exchange({ id: "subagent:explore", kind: "subagent", title: "Explore · Explore the search index", ask: "Explore the search index", ref: { nodeKey: "explore" }, outcome: { status: "running" } }),
      NOW,
    );
    expect(describeAgentFleetTask(explore)).toBeNull();
    expect(describeAgentFleetTask({ name: "fix-tests", task: "Fix tests" })).toBeNull();
    expect(describeAgentFleetTask({ name: "review", task: "  " })).toBeNull();
    // A task that says more than the name stays.
    expect(describeAgentFleetTask({ name: "review", task: "Review the search change" })).toBe("Review the search change");
  });

  test("an in-turn subagent lists its steps and has no shortcut", () => {
    const sub = buildSubagent(
      exchange({
        id: "subagent:explore", kind: "subagent", title: "Explore", ref: { nodeKey: "explore" },
        outcome: { status: "running", progress: ["Reading files", "Searching"] },
      }),
      NOW,
    );
    expect(sub.resolveLabel).toBeUndefined();
    expect(sub.steps?.map((step) => step.title)).toEqual(["Reading files", "Searching"]);
    expect("cost" in sub).toBe(false);
    const staged = buildSubagent(
      exchange({
        kind: "subagent", outcome: { status: "returned" },
        timing: { startedAt: NOW - 30_000, endedAt: NOW, stages: [{ at: NOW - 30_000, label: "Plan" }, { at: NOW - 10_000, label: "Edit", detail: "Edit" }] },
      }),
      NOW,
    );
    expect(staged.steps).toEqual([
      { id: "delegated-task:review:stage:0", title: "Plan", tookMs: 20_000 },
      { id: "delegated-task:review:stage:1", title: "Edit", tool: "Edit" },
    ]);
  });
});

describe("keyboard and open state", () => {
  test("arrows step without wrapping, Home and End jump, other keys do nothing", () => {
    expect(moveAgentFleetFocus("ArrowDown", 0, 3)).toBe(1);
    expect(moveAgentFleetFocus("ArrowDown", 2, 3)).toBe(2);
    expect(moveAgentFleetFocus("ArrowUp", 0, 3)).toBe(0);
    expect(moveAgentFleetFocus("Home", 2, 3)).toBe(0);
    expect(moveAgentFleetFocus("End", 0, 3)).toBe(2);
    expect(moveAgentFleetFocus("Enter", 0, 3)).toBeNull();
    expect(moveAgentFleetFocus("ArrowDown", 0, 0)).toBeNull();
  });

  test("an open id that left the list reads as none; tools stop at three and count the rest", () => {
    expect(resolveAgentFleetOpen([{ id: "a" }], "b")).toBeNull();
    expect(resolveAgentFleetOpen([{ id: "a" }], "a")).toBe("a");
    expect(splitAgentFleetTools(["a", "b", "c", "d", "e"])).toEqual({ shown: ["a", "b", "c"], more: 2 });
  });
});

describe("card heights", () => {
  test("a card takes the two-line height without numbers and the three-line one with them", () => {
    // Main cards: done or unknown with nothing to count.
    expect(sizeAgentFleetCard(agent({ id: "a", status: "done" }), "main")).toBe("compact");
    expect(sizeAgentFleetCard(agent({ id: "a", status: "queued", statusLabel: "Unknown" }), "main")).toBe("compact");
    // A start only counts while running; a measured time, a cost or subagents always do.
    expect(sizeAgentFleetCard(agent({ id: "a", status: "done", startedAt: NOW }), "main")).toBe("compact");
    expect(sizeAgentFleetCard(agent({ id: "a", status: "running", startedAt: NOW }), "main")).toBe("full");
    expect(sizeAgentFleetCard(agent({ id: "a", status: "done", elapsedMs: 1_000 }), "main")).toBe("full");
    expect(sizeAgentFleetCard(agent({ id: "a", status: "done", cost: 0.1 }), "main")).toBe("full");
    expect(sizeAgentFleetCard(agent({ id: "a", status: "done", children: [agent({ id: "b" })] }), "main")).toBe("full");
    // Subagents: name, then a task line that says something, then numbers.
    expect(sizeAgentFleetCard({ name: "docs-pass", status: "queued" }, "subagent")).toBe("compact");
    expect(sizeAgentFleetCard({ name: "docs-pass", status: "running", startedAt: NOW }, "subagent")).toBe("compact");
    expect(sizeAgentFleetCard({ name: "review", task: "Review the change", status: "running", startedAt: NOW }, "subagent")).toBe("full");
    expect(hasAgentFleetNumbers({ status: "done" })).toBe(false);
  });
});

describe("the AgentFleet component", () => {
  afterEach(() => applyAppLocale("en"));
  const agents: AgentFleetAgent[] = [
    agent({
      id: "lead", name: "Lead", model: "Claude Opus 5", status: "running", startedAt: NOW - 65_000, tools: ["Read", "Edit", "Bash", "Grep"].map((tool) => ({ id: tool, name: tool })),
      children: [
        agent({ id: "review", name: "Reviewer", status: "waiting", resolveLabel: "Answer", cost: 0.2 }),
        agent({ id: "queued", name: "Queued helper", status: "queued" }),
      ],
    }),
    agent({ id: "docs", name: "Docs", status: "done", elapsedMs: 125_000 }),
  ];
  const render = (props: Partial<Parameters<typeof AgentFleet>[0]> = {}) =>
    renderToStaticMarkup(createElement(AgentFleet, { agents, now: NOW, onResolve: () => {}, ...props }));

  test("opens the first agent's tree right after its card, with one tab stop in the list", () => {
    const html = render();
    expect(html).toContain('aria-label="Subagents of Lead"');
    expect(html.indexOf('data-agent-fleet-card="lead"')).toBeLessThan(html.indexOf('data-agent-fleet-tree="lead"'));
    expect(html.indexOf('data-agent-fleet-tree="lead"')).toBeLessThan(html.indexOf('data-agent-fleet-card="docs"'));
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/data-agent-fleet-card="[^"]+"[^>]*tabindex="0"|tabindex="0"[^>]*data-agent-fleet-card/g)).toHaveLength(1);
    // Spelled-out status, tools tiles capped at three, the shortcut only on the waiting child.
    expect(html).toContain("Working");
    expect(html).toContain("Needs you");
    expect(html).toContain("Done");
    expect(html).toContain('aria-label="Tools: Read, Edit, Bash, Grep"');
    expect(html).toContain(">+1<");
    expect(html.match(/>Answer</g)).toHaveLength(1);
    expect(html).toContain("1:05");
    expect(html).toContain("2:05");
    // Totals live in a polite region; the cost is the branch rollup.
    expect(html).toMatch(/aria-live="polite"[^>]*>.*2 agents.*1 running.*0 need you.*\$0\.20 total/);
  });

  test("folds with no open agent and omits an unknown cost", () => {
    const html = render({ open: null, agents: agents.map(({ children: _children, ...rest }) => ({ ...rest })) });
    expect(html).not.toContain("Subagents of");
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toContain(" total<");
    expect(html).not.toContain("$0");
  });

  test("draws tools as icons named for assistive tech, never as letters", () => {
    const html = render({
      open: null,
      renderToolIcon: (tool) => (tool.id === "Bash" ? createElement("svg", { "data-test-icon": tool.id }) : null),
    });
    const tools = html.slice(html.indexOf("data-agent-fleet-tools"), html.indexOf('data-agent-fleet-card="docs"'));
    expect(tools.match(/data-agent-fleet-tool="/g)).toHaveLength(3);
    // The host's icon where it has one, the generic tool glyph where it does not.
    expect(tools).toContain('data-test-icon="Bash"');
    expect(tools.match(/lucide-wrench/g)).toHaveLength(2);
    expect(tools).toContain('title="Read"');
    expect(tools).not.toMatch(/>[A-Z]</);
    // The tools group is part of what the card describes.
    expect(html).toMatch(/aria-describedby="[^"]*-tools[^"]*"[^>]*data-agent-fleet-card="lead"/);
  });

  test("keeps two fixed heights and leaves a repeated or empty line out", () => {
    const html = render({
      agents: [
        agent({
          id: "lead",
          status: "running",
          startedAt: NOW - 5_000,
          children: [
            agent({ id: "docs", name: "docs-pass", task: undefined, status: "queued" }),
            agent({ id: "explore", name: "Explore · Explore the search index", task: "Explore the search index", status: "running", startedAt: NOW - 1_000 }),
            agent({ id: "fix", name: "fix", task: "Fix the failing test", status: "running", startedAt: NOW - 1_000 }),
          ],
        }),
        agent({ id: "notes", status: "done" }),
      ],
    });
    expect(html).toMatch(/data-agent-fleet-card="lead"[^>]*data-size="full"/);
    expect(html).toMatch(/data-agent-fleet-card="notes"[^>]*data-size="compact"/);
    // The compact card has no numbers line at all, not an empty one.
    const notes = html.slice(html.indexOf('data-agent-fleet-card="notes"'));
    expect(notes).not.toContain("-meta\"");
    const explore = html.slice(
      html.indexOf('data-agent-fleet-subagent="explore"'),
      html.indexOf('data-agent-fleet-subagent="fix"'),
    );
    expect(explore.match(/Explore the search index/g)).toHaveLength(1);
    expect(explore).not.toContain('-task"');
    expect(html).toMatch(/data-agent-fleet-subagent="docs".*?data-size="compact"/);
    expect(html).toMatch(/data-agent-fleet-subagent="explore".*?data-size="compact"/);
    expect(html).toMatch(/data-agent-fleet-subagent="fix".*?data-size="full"/);
    expect(html).toContain(">Fix the failing test<");
  });

  test("says when there are no agents, when subagents load and when they fail", () => {
    expect(render({ agents: [] })).toContain("No agents");
    const loading = render({ agents: [agent({ id: "a", childrenLoading: true })] });
    expect(loading).toContain("Loading subagents…");
    expect(loading).toContain('aria-busy="true"');
    const failed = render({ agents: [agent({ id: "a", childrenError: "ledger offline" })] });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("ledger offline");
    expect(render({ agents: [agent({ id: "a", children: [] })] })).toContain("No subagents yet.");
  });

  test("reads in Korean", () => {
    applyAppLocale("ko");
    const html = render();
    expect(html).toContain("Lead의 하위 에이전트");
    expect(html).toContain("에이전트 2개");
  });
});

describe("the Tree layout setting", () => {
  const initial = useAppStore.getInitialState();
  const globalWithWindow = globalThis as { window?: unknown };
  const hadWindow = "window" in globalWithWindow;
  const originalWindow = globalWithWindow.window;
  beforeEach(() => {
    globalWithWindow.window = { api: {} };
  });
  afterEach(() => {
    useAppStore.setState(initial, true);
    if (hadWindow) globalWithWindow.window = originalWindow;
    else delete globalWithWindow.window;
  });

  test("persists tree, the default, and keeps the other layouts choosable", () => {
    expect(normalizeFleetBoardLayout("tree")).toBe("tree");
    expect(normalizeFleetBoardLayout(undefined)).toBe("tree");
    expect(normalizeFleetBoardLayout("cards")).toBe("cards");
    expect(useAppStore.getInitialState().settings.fleetBoardLayout).toBe("tree");
    useAppStore.getState().updateSettings({ patch: { fleetBoardLayout: "tree" } });
    expect(useAppStore.getState().settings.fleetBoardLayout).toBe("tree");
    const options = createAppStorePersistenceOptions();
    const written = options.partialize(useAppStore.getState());
    const state = { ...initial, settings: JSON.parse(JSON.stringify(written.settings)) } as unknown as AppState;
    options.onRehydrateStorage()(state);
    expect(state.settings.fleetBoardLayout).toBe("tree");
  });
});
