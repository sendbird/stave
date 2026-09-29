import { describe, expect, test } from "bun:test";
import { buildPlaybookFlowPreview, describeFlowPreviewDoer } from "@/lib/playbooks/flow-preview";
import { PlaybookSchema } from "@/lib/playbooks/schema";
import { createPlaybookFromStarter, findPlaybookStarter } from "@/lib/playbooks/starters";

const NOW = new Date("2026-09-29T09:00:00.000Z");

describe("playbook flow preview", () => {
  test("names who does each stage, where it stops and what leaves the workspace, without changing the playbook", () => {
    const base = createPlaybookFromStarter(findPlaybookStarter("slack-request-to-pr")!, { now: NOW, id: "p" });
    const build = base.stages.findIndex((stage) => stage.kind === "ai" && !stage.role);
    const playbook = PlaybookSchema.parse({
      ...base,
      stages: base.stages.map((stage, index) =>
        index === build && stage.kind === "ai" ? { ...stage, agentConfigId: "reviewer", pinCommit: true } : index === build + 1 && stage.kind === "ai" ? { ...stage, agentConfigId: "gone" } : stage,
      ),
    });
    const before = JSON.stringify(playbook);
    const flow = buildPlaybookFlowPreview(playbook, { reviewer: "Reviewer" });
    expect(JSON.stringify(playbook)).toBe(before);
    expect(flow.nodes).toHaveLength(playbook.stages.length);
    expect(flow.nodes[0]!.asksFirst).toBe(false);
    const reviewed = flow.nodes[build]!;
    expect(describeFlowPreviewDoer(reviewed.doer)).toBe("Reviewer · delegated task");
    expect(reviewed.pinned).toBe(true);
    expect(flow.missingAgents).toEqual(["gone"]);
    expect(flow.nodes.filter((node) => node.doer.kind === "stave").every((node) => node.externalEffect)).toBe(true);
    expect(flow.stops).toBe(flow.nodes.filter((node) => node.asksFirst).length);
    expect(flow.agents).toBe(2);
  });
});
