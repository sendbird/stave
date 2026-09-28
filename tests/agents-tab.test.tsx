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

  test("the tab renders the list and the first agent's Assign panel", () => {
    const html = renderToStaticMarkup(createElement(AgentsTab));
    expect(html).toContain('data-testid="agents-tab"');
    expect(html).toContain("Implementer");
    expect(html).toContain("Assign");
    expect(html).toContain("As a main agent");
  });
});
