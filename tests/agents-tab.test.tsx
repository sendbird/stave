import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsTab } from "../src/components/agents/AgentsTab";
import { describeAgent, describeProviderSupport, groupAgents } from "@/lib/agents/agents-view";
import { duplicateAgent, listAgents } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";

describe("agents view", () => {
  test("a built-in agent reads in product words", () => {
    expect(describeAgent(getBuiltinAgent("reviewer")!)).toBe("Auto-routing · Current workspace · Read only");
    expect(describeAgent(getBuiltinAgent("implementer")!)).toBe("Auto-routing · New worktree · Auto");
  });

  test("provider support says what is enforced and what is only asked", () => {
    const rows = describeProviderSupport(getBuiltinAgent("researcher")!, ["claude-code", "codex", "kiro"]);
    expect(rows.map((row) => [row.providerId, row.instructions, row.tools])).toEqual([
      ["claude-code", "enforced", "enforced"],
      ["codex", "enforced", "instructed"],
      ["kiro", "instructed", "instructed"],
    ]);
  });

  test("an agent not usable as a main agent explains why on every provider", () => {
    const rows = describeProviderSupport(getBuiltinAgent("scout")!, ["claude-code"]);
    expect(rows[0]!.refusal).toContain("can't be used as a main agent");
  });

  test("groups show custom first, then built-in, and search matches name or use-when", () => {
    const copy = duplicateAgent(getBuiltinAgent("planner")!, []);
    const groups = groupAgents(listAgents({ custom: [copy] }));
    expect(groups.map((group) => group.label)).toEqual(["Custom", "Built-in"]);
    expect(groupAgents(listAgents({ custom: [] }), "commit").flatMap((group) => group.agents.map((agent) => agent.id))).toEqual([
      "reviewer",
    ]);
  });

  test("the tab renders the list and a Start work button for the first agent", () => {
    const html = renderToStaticMarkup(createElement(AgentsTab));
    expect(html).toContain('data-testid="agents-tab"');
    expect(html).toContain("Implementer");
    // The embedded Assign panel is gone; the detail offers Start work… which
    // opens Kickoff.
    expect(html).toContain("Start work");
    // The agent's assignments section is titled "Work" (was "Recent work").
    expect(html).toContain(">Work<");
    expect(html).not.toContain("Recent work");
    // Settings and History are the only detail tabs; Activity sits in the body.
    expect(html).toContain("Settings");
    expect(html).toContain("History");
    expect(html).not.toContain(">Preview<");
  });

  test("learned suggestions show the summary and Apply, Edit and Dismiss", async () => {
    const { AgentSuggestions } = await import("../src/components/agents/AgentSuggestions");
    const agent = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const html = renderToStaticMarkup(
      createElement(AgentSuggestions, {
        agent,
        learning: true,
        onLearningChange: () => {},
        onApply: () => {},
        onDismiss: () => {},
        suggestions: [
          {
            id: `${agent.id}:t1`,
            agentConfigId: agent.id,
            taskId: "t1",
            createdAt: "2026-09-29T10:00:00.000Z",
            summary: "Run the linter before reporting.",
            instructions: `${agent.instructions}\nRun the linter before reporting.`,
            basedOn: agent.instructions,
          },
        ],
      }),
    );
    expect(html).toContain("Learned suggestions");
    expect(html).toContain("Run the linter before reporting.");
    for (const label of ["Apply", "Edit", "Dismiss", "Learn from my corrections"]) expect(html).toContain(label);
    expect(html).not.toContain("instructions changed since");
  });
});

describe("start work entry points", () => {
  test("an issue opens Kickoff with the ticket as the work source", async () => {
    const { assignTrackerIssueToAgent } = await import("../src/components/layout/issues/assign-issue-to-agent");
    const { useAgentsUiStore } = await import("@/store/agents-ui-store");
    assignTrackerIssueToAgent({
      source: "crane",
      ref: "r1",
      key: "WEB-418",
      title: "Export invoices as CSV",
      url: "https://crane.example/WEB-418",
      links: [],
    } as never);
    const request = useAgentsUiStore.getState().kickoffRequest;
    expect(request?.source).toBe("WEB-418");
    expect(request?.text).toContain("Title: Export invoices as CSV");
    useAgentsUiStore.getState().clearKickoffRequest();
  });

  test("`!assign` is offered in the composer palette and is not a playbook", async () => {
    const { ASSIGN_PALETTE_ENTRY, isAssignPaletteEntry, playbookIdOfPaletteEntry } = await import(
      "../src/components/session/HandOffControl"
    );
    expect(ASSIGN_PALETTE_ENTRY.slug).toBe("assign");
    expect(ASSIGN_PALETTE_ENTRY.label).toBe("Start work with an agent…");
    expect(isAssignPaletteEntry(ASSIGN_PALETTE_ENTRY)).toBe(true);
    expect(playbookIdOfPaletteEntry(ASSIGN_PALETTE_ENTRY)).toBeNull();
  });

  test("openKickoffWithAgent raises a fresh nonce so an open dialog reopens", async () => {
    const { useAgentsUiStore } = await import("@/store/agents-ui-store");
    useAgentsUiStore.getState().clearKickoffRequest();
    useAgentsUiStore.getState().openKickoffWithAgent({ agentConfigId: "ui-maintainer" });
    const first = useAgentsUiStore.getState().kickoffRequest;
    expect(first?.agentConfigId).toBe("ui-maintainer");
    useAgentsUiStore.getState().openKickoffWithAgent({ text: "next" });
    const second = useAgentsUiStore.getState().kickoffRequest;
    expect(second?.text).toBe("next");
    expect((second?.nonce ?? 0) > (first?.nonce ?? 0)).toBe(true);
    useAgentsUiStore.getState().clearKickoffRequest();
  });
});
