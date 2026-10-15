import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { i18n } from "@/i18n/runtime";
import { agentInitials } from "@/lib/agents/agent-appearance";
import { getAgentIcon } from "@/lib/agents/agent-icons";
import { getAgentDisplayName } from "@/lib/agents/display";
import { importAgentFile } from "@/lib/agents/import";
import { blankCustomAgent, duplicateAgent, listAgents, upsertCustomAgent } from "@/lib/agents/library";
import { selectableMainAgents } from "@/lib/agents/selector-choice";
import { BUILTIN_AGENTS, currentAgentId, getBuiltinAgent } from "@/lib/agents/starters";

const ORDER = ["implementer", "lead", "debugger", "ui-polisher", "reviewer", "researcher", "shipper"];

describe("built-in agents", () => {
  test("the selector lists them by expected use", () => {
    expect(selectableMainAgents([]).map((agent) => agent.id)).toEqual(ORDER);
  });

  test("every general agent carries the shared style and routes through Auto", () => {
    for (const id of ORDER) {
      const agent = getBuiltinAgent(id)!;
      expect(agent.model.mode).toBe("auto");
      expect(agent.model.mode === "auto" && agent.model.taskClass).toBeTruthy();
      expect(agent.instructions).toContain("Separate facts from inference");
      expect(agent.instructions).toContain("finish the whole scope");
    }
  });

  test("reviewers and researchers cannot edit; the others can", () => {
    for (const id of ["reviewer", "researcher"]) expect(getBuiltinAgent(id)!.permission).toBe("read-only");
    for (const id of ["implementer", "lead", "debugger", "ui-polisher", "shipper"]) {
      expect(getBuiltinAgent(id)!.permission).not.toBe("read-only");
    }
  });

  test("a built-in agent is Read only or Auto: a main agent's turn applies no other level", () => {
    // Every turn of a main agent runs without routine prompts unless it is
    // read only (`turn-policy.ts`), so a Guided or Manual label would describe
    // nothing it does. Lead was shown as Guided for that reason.
    for (const agent of BUILTIN_AGENTS) expect(["read-only", "auto"]).toContain(agent.permission);
    expect(getBuiltinAgent("lead")!.permission).toBe("auto");
  });

  test("Lead may call every other general agent, and every call target exists", () => {
    expect([...(getBuiltinAgent("lead")!.canCall ?? [])].sort()).toEqual(ORDER.filter((id) => id !== "lead").sort());
    for (const agent of BUILTIN_AGENTS) {
      for (const id of agent.canCall ?? []) expect(getBuiltinAgent(id)).toBeDefined();
    }
  });

  test("planner still resolves, to Lead, and stays reserved", () => {
    expect(currentAgentId("planner")).toBe("lead");
    expect(getBuiltinAgent("planner")?.id).toBe("lead");
    expect(listAgents({ custom: [] }).some((agent) => agent.id === "planner")).toBe(false);
    const clash = { ...blankCustomAgent({ name: "Other", takenIds: [] }), id: "planner" };
    expect(() => upsertCustomAgent([], clash)).toThrow();
    expect(blankCustomAgent({ name: "Planner", takenIds: [] }).id).not.toBe("planner");
  });

  test("Shipper, UI Polisher and Debugger follow a workflow; the rest run as one stage", () => {
    expect(ORDER.filter((id) => getBuiltinAgent(id)!.workflow)).toEqual(["debugger", "ui-polisher", "shipper"]);
    expect(getBuiltinAgent("shipper")!.workflow!.map((stage) => stage.title)).toEqual([
      "Validate",
      "Open draft PR",
      "Watch checks",
      "Ready for review",
    ]);
    for (const id of ["implementer", "researcher"]) expect(getBuiltinAgent(id)!.workflow).toBeUndefined();
  });
});

describe("built-in avatars", () => {
  test("every built-in, general agent and subagent preset alike, has a catalog icon and a colour", () => {
    expect(BUILTIN_AGENTS).toHaveLength(13);
    for (const agent of BUILTIN_AGENTS) {
      expect(getAgentIcon(agent.appearance?.icon)).not.toBeNull();
      expect(agent.appearance?.color).toBeDefined();
    }
    const icons = BUILTIN_AGENTS.map((agent) => agent.appearance?.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  test("the seven general agents never share a colour", () => {
    const colors = ORDER.map((id) => getBuiltinAgent(id)!.appearance?.color);
    expect(new Set(colors).size).toBe(ORDER.length);
  });

  test("agents whose initials start alike, in English or Korean, differ in both icon and colour", async () => {
    const pairs = new Set<string>();
    const original = i18n.language;
    try {
      for (const language of ["en", "ko"]) {
        await i18n.changeLanguage(language);
        const byLead = new Map<string, string[]>();
        for (const agent of BUILTIN_AGENTS) {
          const lead = agentInitials(getAgentDisplayName(agent))[0]!;
          byLead.set(lead, [...(byLead.get(lead) ?? []), agent.id]);
        }
        for (const ids of byLead.values()) {
          for (const [index, left] of ids.entries()) {
            for (const right of ids.slice(index + 1)) pairs.add([left, right].sort().join("|"));
          }
        }
      }
    } finally {
      await i18n.changeLanguage(original);
    }
    // The clashes the defaults were chosen against, so a renamed agent that
    // stops clashing (or starts) shows up here.
    for (const pair of ["researcher|reviewer", "researcher|scout", "debugger|deep-packet", "lead|reviewer", "scout|shipper", "second-pair|sweep"]) {
      expect(pairs).toContain(pair);
    }
    for (const pair of pairs) {
      const [left, right] = pair.split("|").map((id) => getBuiltinAgent(id)!.appearance!);
      expect({ pair, icon: left!.icon === right!.icon, color: left!.color === right!.color }).toEqual({ pair, icon: false, color: false });
    }
  });

  test("a copy of a built-in keeps its icon and colour", () => {
    const reviewer = getBuiltinAgent("reviewer")!;
    expect(duplicateAgent(reviewer, []).appearance).toEqual(reviewer.appearance);
  });
});

describe("this repository's own agent file", () => {
  test("the releaser agent file imports cleanly and binds the release skill", () => {
    const result = importAgentFile({
      path: ".claude/agents/releaser.md",
      content: readFileSync(".claude/agents/releaser.md", "utf8"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.id).toBe("releaser");
    expect(result.agent.skills).toEqual(["stave-release"]);
    expect(result.notes).toEqual([]);
  });
});
