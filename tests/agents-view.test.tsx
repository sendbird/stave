import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsView } from "../src/components/agents/AgentsView";
import { useAgentsViewStore } from "@/store/agents-view-store";

afterEach(() => {
  useAgentsViewStore.setState({ activeTab: "agents" });
});

describe("agents surface", () => {
  test("the surface renders Agents, My standards and Performance, Agents by default, and no Workflows tab", () => {
    const html = renderToStaticMarkup(createElement(AgentsView));
    expect(html).toContain("Agents");
    expect(html).not.toContain("Workflows");
    expect(html).toContain("My standards");
    expect(html).toContain("Performance");
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
