import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsTab, ProviderSupport } from "../src/components/agents/AgentsTab";
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
      "shipper",
    ]);
  });

  test("the tab renders the list and an Assign button for the first agent", () => {
    const html = renderToStaticMarkup(createElement(AgentsTab));
    expect(html).toContain('data-testid="agents-tab"');
    expect(html).toContain("Implementer");
    // The embedded Assign panel is gone; the detail offers Assign… which
    // opens Kickoff.
    expect(html).toContain("Assign…");
    // A built-in that was never assigned has no Work list and no History to
    // tab to: the page goes straight from the header to its settings.
    expect(html).not.toContain(">Work<");
    expect(html).not.toContain("Nothing assigned yet");
    expect(html).not.toContain("Recent work");
    expect(html).not.toContain(">History<");
    expect(html).not.toContain(">Preview<");
    // Implementer can be a main agent, so its provider table stays.
    expect(html).toContain("As a main agent");
  });

  test("a worker-only agent has no main-agent table of refusals", () => {
    expect(renderToStaticMarkup(createElement(ProviderSupport, { agent: getBuiltinAgent("scout")! }))).toBe("");
    const main = renderToStaticMarkup(createElement(ProviderSupport, { agent: getBuiltinAgent("implementer")! }));
    expect(main).toContain("As a main agent");
    expect(main).not.toContain("can&#x27;t be used");
  });

  test("an assigned agent lists its work under Work", async () => {
    const { AgentActivity } = await import("../src/components/agents/AgentActivity");
    const row = {
      id: "a1",
      agentConfigId: "implementer",
      agentContentHash: "h",
      assignment: "Tighten the sidebar spacing\nKeep keyboard order",
      state: "started",
      taskId: null,
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-01T09:00:00.000Z",
    } as never;
    const html = renderToStaticMarkup(createElement(AgentActivity, { assignments: [row] }));
    expect(html).toContain(">Work<");
    expect(html).toContain("Tighten the sidebar spacing");
    expect(renderToStaticMarkup(createElement(AgentActivity, { assignments: [] }))).toBe("");
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

describe("agent detail hierarchy", () => {
  const chipsOf = async (agent: ReturnType<typeof getBuiltinAgent>) => {
    const { AgentProfileHeader } = await import("../src/components/agents/AgentProfileHeader");
    const html = renderToStaticMarkup(createElement(AgentProfileHeader, { agent: agent! }));
    return [...html.matchAll(/<span class="[^"]*">([^<]+)<\/span>/g)].map((match) => match[1]);
  };

  test("the header says the model once and only flags Read only", async () => {
    const reviewer = getBuiltinAgent("reviewer")!;
    expect(await chipsOf(reviewer)).toEqual(["Built-in", "Auto", "Read only"]);
    expect(await chipsOf(getBuiltinAgent("implementer")!)).toEqual(["Built-in", "Auto"]);
    const pinned = { ...reviewer, permission: "auto" as const, model: { mode: "fixed" as const, providerId: "codex" as const, model: "gpt-5" } };
    expect(await chipsOf(pinned)).toEqual(["Built-in", "gpt-5"]);
  });

  test("activity shows relative last used and no zero-value tiles", async () => {
    const { AgentActivity } = await import("../src/components/agents/AgentActivity");
    const row = (id: string, state: string, createdAt: string) =>
      ({ id, state, createdAt, taskId: null, assignment: "Do it" }) as never;
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        assignments: [row("a", "started", new Date(Date.now() - 3 * 86_400_000).toISOString()), row("b", "failed", "2019-01-01T00:00:00.000Z")],
      }),
    );
    expect(html).toContain("2 assignments");
    expect(html).toContain("1 couldn&#x27;t start");
    expect(html).toContain("Last used");
    expect(html).toContain("3 days ago");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("running");
    expect(html).not.toContain("need you");
  });

  test("learned suggestions are a single line with nothing to review", async () => {
    const { AgentSuggestions } = await import("../src/components/agents/AgentSuggestions");
    const agent = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const render = (learning: boolean) =>
      renderToStaticMarkup(
        createElement(AgentSuggestions, {
          agent,
          learning,
          suggestions: [],
          onLearningChange: () => {},
          onApply: () => {},
          onDismiss: () => {},
        }),
      );
    const on = render(true);
    expect(on).toContain("Learned suggestions");
    expect(on).toContain("None yet.");
    expect(on).toContain("Learn from my corrections");
    expect(on).not.toContain("<ul");
    expect(render(false)).toContain("Learning is off.");
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

  test("`!assign` is offered in the composer palette", async () => {
    const { ASSIGN_PALETTE_ENTRY, isAssignPaletteEntry } = await import("../src/components/session/assign-palette-entry");
    expect(ASSIGN_PALETTE_ENTRY.slug).toBe("assign");
    expect(ASSIGN_PALETTE_ENTRY.label).toBe("Assign to an agent…");
    expect(isAssignPaletteEntry(ASSIGN_PALETTE_ENTRY)).toBe(true);
    expect(isAssignPaletteEntry({ id: "macro-1" })).toBe(false);
  });

  test("the palette's Assign to an agent… opens the composer selector on Agents when a task is open", async () => {
    const { useAgentsUiStore } = await import("@/store/agents-ui-store");
    const before = useAgentsUiStore.getState().agentSelectorNonce;
    useAgentsUiStore.getState().requestAgentSelector();
    expect(useAgentsUiStore.getState().agentSelectorNonce).toBe(before + 1);
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
