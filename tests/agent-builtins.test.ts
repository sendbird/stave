import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BUILTIN_AGENT_WORKFLOWS, BUILTIN_AGENT_WORKFLOW_IDS } from "@/lib/agents/builtin-workflows";
import { importAgentFile } from "@/lib/agents/import";
import { blankCustomAgent, listAgents, upsertCustomAgent } from "@/lib/agents/library";
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
    for (const id of ["implementer", "debugger", "ui-polisher", "shipper"]) {
      expect(getBuiltinAgent(id)!.permission).not.toBe("read-only");
    }
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

  test("each general agent has recommended workflow stages with a done-when", () => {
    expect([...BUILTIN_AGENT_WORKFLOW_IDS].sort()).toEqual([...ORDER].sort());
    for (const id of BUILTIN_AGENT_WORKFLOW_IDS) {
      const stages = BUILTIN_AGENT_WORKFLOWS[id];
      expect(stages.length).toBeGreaterThanOrEqual(3);
      for (const stage of stages) {
        expect(stage.title.length).toBeGreaterThan(0);
        expect(stage.doneWhen.length).toBeGreaterThan(0);
      }
    }
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
