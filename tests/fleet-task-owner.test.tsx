import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetTaskTableView } from "@/components/layout/FleetTaskTable";
import { applyAppLocale } from "@/i18n";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { fleetAppliedFilters } from "@/lib/fleet/fleet-applied-filters";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import { sortFleetTaskRows } from "@/lib/fleet/task-table-sort";
import {
  FLEET_OWNER_FILTER_OPTIONS,
  matchesFleetOwnerFilter,
  resolveFleetTaskOwner,
  type FleetTaskOwnerSources,
} from "@/lib/fleet/task-owner";
import type { TarsSnapshot } from "@/lib/tars/types";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { useTarsSnapshotStore } from "@/store/tars-snapshot-store";
import type { Task } from "@/types/chat";
import { agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";
import { TARS_AT, tarsResponsibility } from "./fixtures/tars-host-bridge";

const runs = (...details: AgentRunDetail[]) => Object.fromEntries(details.map((detail) => [detail.agentRun.id, detail]));
/** Tars holds task-1 with its own run agent-run-1; task-2 runs a run you started; task-3 has none. */
function sources(overrides: Partial<FleetTaskOwnerSources> = {}): FleetTaskOwnerSources {
  return {
    responsibilities: [tarsResponsibility()],
    tarsKnown: true,
    runs: runs(agentRunDetail(agentRunFixture({ id: "agent-run-1", leadTaskId: "task-1" })),
      agentRunDetail(agentRunFixture({ id: "user-run", leadTaskId: "task-2" }))),
    runsLoaded: true,
    ...overrides,
  };
}
const ownerOf = (taskId: string, overrides?: Partial<FleetTaskOwnerSources>) =>
  resolveFleetTaskOwner({ workspaceId: "ws-1", taskId }, sources(overrides));

beforeEach(async () => {
  await applyAppLocale("en");
});

describe("who owns a Fleet task", () => {
  test("Tars, an agent run, or you, by the same rule as the Tars mark", () => {
    expect(ownerOf("task-1")).toBe("tars");
    expect(ownerOf("task-2")).toBe("agentRun");
    expect(ownerOf("task-3")).toBe("you");
    // A run you started on a task Tars lost is never Tars's.
    expect(ownerOf("task-1", { runs: runs(agentRunDetail(agentRunFixture({ id: "mine", leadTaskId: "task-1" }))) })).toBe("agentRun");
    // Work you took over is no longer Tars's.
    expect(ownerOf("task-1", { responsibilities: [tarsResponsibility({ state: "takenOver" })] })).toBe("agentRun");
  });

  test("an unread source is never guessed as you", () => {
    expect(ownerOf("task-3", { runs: {}, runsLoaded: false })).toBeNull();
    expect(ownerOf("task-3", { responsibilities: [], tarsKnown: false })).toBeNull();
    // Tars already named as owner needs nothing else.
    expect(ownerOf("task-1", { runs: {}, runsLoaded: false, tarsKnown: true })).toBe("tars");
  });

  test("the owner filter keeps one owner and never claims an unknown one", () => {
    expect(FLEET_OWNER_FILTER_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ["all", "All owners"], ["tars", "Tars"], ["agentRun", "Agent runs"], ["you", "You"],
    ]);
    expect(matchesFleetOwnerFilter("tars", "tars")).toBe(true);
    expect(matchesFleetOwnerFilter("you", "tars")).toBe(false);
    expect(matchesFleetOwnerFilter(null, "you")).toBe(false);
    expect(matchesFleetOwnerFilter(null, "all")).toBe(true);
  });

  test("a narrowed owner is an applied filter chip, in English and Korean", async () => {
    expect(fleetAppliedFilters({ filter: "active", owner: "all", query: "" })).toEqual([]);
    expect(fleetAppliedFilters({ filter: "active", owner: "tars", query: "" })).toEqual([
      { id: "owner", property: "Owner", operator: "is", value: "Tars" },
    ]);
    await applyAppLocale("ko");
    expect(fleetAppliedFilters({ filter: "active", owner: "agentRun", query: "" })[0]).toMatchObject({ id: "owner", property: "담당", value: "에이전트 실행" });
  });
});

describe("the table's Owner column", () => {
  const tarsInitial = useTarsSnapshotStore.getInitialState();
  const runsInitial = useFleetAgentRunsStore.getInitialState();
  const saved = { snapshot: tarsInitial.snapshot, details: runsInitial.details, loaded: runsInitial.loaded };
  /* Server rendering reads each store's initial state, so the scene is seeded there too. */
  function seed(snapshot: TarsSnapshot | null, details: Record<string, AgentRunDetail>, loaded: boolean) {
    tarsInitial.snapshot = snapshot;
    useTarsSnapshotStore.setState({ snapshot });
    Object.assign(runsInitial, { details, loaded });
    useFleetAgentRunsStore.setState({ details, loaded });
  }
  afterEach(() => seed(saved.snapshot, saved.details, saved.loaded));

  const row = (id: string) => ({ key: id, repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceId: "ws-1", workspaceName: "ws-1",
    workspaceBranch: null, workspaceActivity: "live", status: "idle", need: null, waitingSince: null, activeTurnId: null, rank: { lane: "idle" },
    task: { id, title: id, provider: "codex", updatedAt: TARS_AT, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" } as Task,
  }) as unknown as FleetTaskRow;

  test("names each row's owner after its task, with Tars wearing its mark", () => {
    seed({ identity: { id: "personal", name: "Tars", instructions: "", updatedAt: TARS_AT }, responsibilities: [tarsResponsibility()], pendingDecisions: [], runtime: "desktop" },
      sources().runs, true);
    const html = renderToStaticMarkup(createElement(FleetTaskTableView, { rows: [row("task-1"), row("task-2"), row("task-3")], nowMs: Date.parse(TARS_AT), onOpenTask() {} }));
    const headers = [...html.matchAll(/data-fleet-task-column="([a-z]+)"/g)].map((match) => match[1]);
    expect(headers).toEqual(["task", "owner", "workspace", "state", "needs", "waiting", "activity"]);
    const segment = (id: string) => html.split(`data-fleet-task-table-row="${id}"`)[1]!.split("data-fleet-task-table-row")[0]!;
    expect(segment("task-1")).toContain("data-tars-owner");
    expect(segment("task-2")).toContain('data-fleet-task-owner="agentRun"');
    expect(segment("task-2")).toContain(">Agent run<");
    expect(segment("task-3")).toContain(">You<");
  });

  test("an owner not yet known reads Unknown, never You", () => {
    seed(null, {}, false);
    const html = renderToStaticMarkup(createElement(FleetTaskTableView, { rows: [row("task-3")], nowMs: Date.parse(TARS_AT), onOpenTask() {} }));
    expect(html).toContain('data-fleet-task-owner="unknown"');
    expect(html).toContain(">Unknown<");
  });

  test("sorting by owner orders by its words and keeps unknown owners last", () => {
    const owners: Record<string, "tars" | "agentRun" | "you" | null> = { a: "you", b: null, c: "agentRun", d: "tars" };
    const sorted = sortFleetTaskRows([row("a"), row("b"), row("c"), row("d")], { key: "owner", direction: "ascending" },
      { nowMs: 0, untitled: "Untitled", ownerOf: (candidate) => owners[candidate.key] });
    expect(sorted.map((candidate) => candidate.key)).toEqual(["c", "d", "a", "b"]);
  });
});
