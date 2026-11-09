import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentActivity, useTarsWorkFilter } from "../src/components/agents/AgentActivity";
import { useTarsSnapshotStore } from "../src/store/tars-snapshot-store";
import type { TarsSnapshot } from "../src/lib/tars/types";

const AT = "2026-11-05T00:00:00.000Z";
const initial = useTarsSnapshotStore.getInitialState();
const withTars: TarsSnapshot = {
  identity: { id: "personal", name: "Tars", instructions: "", updatedAt: AT },
  responsibilities: [{ id: "123e4567-e89b-42d3-a456-426614174000", requestId: "r", title: "Fix search", instruction: "Fix it",
    acceptanceCriteria: ["Works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex", model: null, agentId: null,
    priority: 50, maxTurns: 30, revision: 1, state: "running", detail: null, taskId: null, executionWorkspaceId: null, agentRunId: null,
    reverifyAfter: null, createdAt: AT, updatedAt: AT }],
  pendingDecisions: [], runtime: "desktop",
};
// Server rendering reads the store's initial state.
const useSnapshot = (snapshot: TarsSnapshot | null) => { initial.snapshot = snapshot; useTarsSnapshotStore.setState({ snapshot }); };
afterEach(() => useSnapshot(null));

function Probe(props: { agentConfigId: string }) {
  const filter = useTarsWorkFilter(props.agentConfigId);
  return createElement("output", null, JSON.stringify({ excludeTars: filter.excludeTars, toggle: Boolean(filter.toggle) }));
}
const probe = (agentConfigId: string) => JSON.parse(renderToStaticMarkup(createElement(Probe, { agentConfigId })).replace(/<\/?output>/g, "").replaceAll("&quot;", "\""));

describe("the Supervisor's Work list and Tars", () => {
  test("Tars work is hidden on the Supervisor page by default; the switch appears once Tars has had work", () => {
    expect(probe("supervisor")).toEqual({ excludeTars: true, toggle: false });
    useSnapshot(withTars);
    expect(probe("supervisor")).toEqual({ excludeTars: true, toggle: true });
    // Other agents never carry Tars's assignments, so nothing changes there.
    expect(probe("implementer")).toEqual({ excludeTars: false, toggle: false });
  });

  test("with Tars's work hidden and nothing else assigned, the switch stays so the work can be shown", () => {
    const hidden = renderToStaticMarkup(createElement(AgentActivity, { assignments: [], tarsWork: { shown: false, onShownChange() {} } }));
    expect(hidden).toContain("Show Tars work");
    expect(hidden).toContain("No work besides what Tars delegated.");
    expect(hidden).toContain('aria-checked="false"');
    // Without the switch, an agent that was never assigned still shows nothing.
    expect(renderToStaticMarkup(createElement(AgentActivity, { assignments: [] }))).toBe("");
  });
});
