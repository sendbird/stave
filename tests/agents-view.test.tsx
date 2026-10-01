import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsView } from "../src/components/agents/AgentsView";
import { useAgentsViewStore } from "@/store/agents-view-store";

afterEach(() => {
  useAgentsViewStore.setState({ activeTab: "agents" });
});

describe("agents surface", () => {
  test("the surface renders Agents and My standards, Agents by default, and no Playbooks tab", () => {
    const html = renderToStaticMarkup(createElement(AgentsView));
    expect(html).toContain("Agents");
    expect(html).not.toContain("Playbooks");
    expect(html).toContain("My standards");
    // Default tab shows the agents list.
    expect(html).toContain('data-testid="agents-tab"');
  });

  test("the My standards tab is selectable", () => {
    useAgentsViewStore.getState().setActiveTab("standards");
    expect(useAgentsViewStore.getState().activeTab).toBe("standards");
    expect(() => renderToStaticMarkup(createElement(AgentsView))).not.toThrow();
  });

  test("setActiveTab keeps a stable state reference when unchanged", () => {
    useAgentsViewStore.getState().setActiveTab("agents");
    const before = useAgentsViewStore.getState();
    useAgentsViewStore.getState().setActiveTab("agents");
    expect(useAgentsViewStore.getState()).toBe(before);
  });
});
