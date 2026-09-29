import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsView } from "../src/components/agents/AgentsView";
import { useAgentsViewStore } from "@/store/agents-view-store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";
import { useAppStore } from "@/store/app.store";

afterEach(() => {
  useAgentsViewStore.setState({ activeTab: "agents" });
});

describe("agents surface", () => {
  test("the surface renders all three tabs and the Agents tab by default", () => {
    const html = renderToStaticMarkup(createElement(AgentsView));
    expect(html).toContain("Agents");
    expect(html).toContain("Playbooks");
    expect(html).toContain("My standards");
    // Default tab shows the agents list.
    expect(html).toContain('data-testid="agents-tab"');
  });

  test("the Playbooks tab renders the playbooks surface", () => {
    useAgentsViewStore.getState().setActiveTab("playbooks");
    expect(useAgentsViewStore.getState().activeTab).toBe("playbooks");
    // Rendering the surface with playbooks selected does not throw.
    expect(() => renderToStaticMarkup(createElement(AgentsView))).not.toThrow();
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

  test("opening playbooks lands on the Playbooks tab and the Agents surface", () => {
    useAppStore.setState({ activeAppSurface: { kind: "workspace" } } as never);
    usePlaybooksUiStore.getState().openPlaybooks();
    expect(useAgentsViewStore.getState().activeTab).toBe("playbooks");
    expect(useAppStore.getState().activeAppSurface.kind).toBe("agents");
    // Reset the surface for other tests.
    useAppStore.getState().closeAgents();
    usePlaybooksUiStore.getState().consumeCenterRequest();
  });
});
