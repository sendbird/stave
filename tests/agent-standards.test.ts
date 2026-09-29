import { describe, expect, test } from "bun:test";
import { describeAssignmentReceived } from "@/lib/agents/agents-view";
import { compileAgent, snapshotAgent } from "@/lib/agents/compile";
import { applyAgentToDelegation } from "@/lib/agents/delegate";
import { exportAgentFile } from "@/lib/agents/export";
import { duplicateAgent } from "@/lib/agents/library";
import { agentWorkerConfig, taskAgentRuntimeOptions } from "@/lib/agents/runtime-options";
import { activeStandards, normalizeMyStandards } from "@/lib/agents/standards";
import { getBuiltinAgent } from "@/lib/agents/starters";

const STANDARDS = "Name every test you ran.";

describe("my standards", () => {
  test("follow the agent's instructions on every role and show as a source, without changing the version", () => {
    const researcher = getBuiltinAgent("researcher")!;
    const snapshot = snapshotAgent(researcher);
    const primary = compileAgent({ snapshot, role: "primary", providerId: "claude-code", standards: STANDARDS });
    if (!primary.ok || primary.compiled.role !== "primary") throw new Error("compile");
    const text = primary.compiled.instructions;
    expect(text.indexOf(researcher.instructions)).toBeLessThan(text.indexOf("## My standards"));
    expect(text).toContain(STANDARDS);
    expect(primary.compiled.contentHash).toBe(snapshot.contentHash);
    const view = describeAssignmentReceived({
      agentName: "Researcher",
      agentContentHash: snapshot.contentHash,
      received: primary.compiled.received,
      support: primary.compiled.support,
      current: researcher,
    });
    expect(view.lines).toContainEqual({ label: "My standards", detail: "Included" });

    // Later turns keep the standards the task started with.
    expect(taskAgentRuntimeOptions({ agent: researcher, providerId: "codex", standards: STANDARDS }).agentInstructions).toContain(STANDARDS);
    expect(taskAgentRuntimeOptions({ agent: researcher, providerId: "codex" }).agentInstructions).not.toContain("My standards");

    const copy = duplicateAgent(getBuiltinAgent("reviewer")!, []);
    expect(agentWorkerConfig(copy, "claude-code", STANDARDS)?.instructions).toContain(STANDARDS);
    const delegated = applyAgentToDelegation({
      args: {
        repositoryPath: "/tmp/r",
        parentWorkspaceId: "w",
        parentTaskId: "t",
        delegationKey: "k",
        prompt: "Review.",
        providerId: "codex",
        permissionProfile: "guided",
        lifecycle: "one-turn",
        workspace: { mode: "same-workspace" },
        retry: false,
      },
      agent: copy,
      standards: STANDARDS,
    });
    expect(delegated.ok && delegated.args.prompt).toContain(STANDARDS);
  });

  test("are off by default, never exported, and empty text counts as off", () => {
    expect(activeStandards(normalizeMyStandards(undefined))).toBeUndefined();
    expect(activeStandards({ enabled: true, text: "   " })).toBeUndefined();
    expect(activeStandards({ enabled: false, text: STANDARDS })).toBeUndefined();
    expect(activeStandards({ enabled: true, text: STANDARDS })).toBe(STANDARDS);
    const file = exportAgentFile(duplicateAgent(getBuiltinAgent("implementer")!, []), "claude-md");
    expect(file.content).not.toContain("My standards");
  });
});
