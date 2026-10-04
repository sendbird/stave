import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { createAgentRun } from "../src/lib/agent-runs/domain";
import { resolveConsentStageSignOff } from "../src/lib/agent-runs/policy";
import { AGENT_RUN_NOW } from "./fixtures/agent-run-fixtures";

const shipper = getBuiltinAgent("shipper")!;

function start(checkIns?: "when-stuck" | "plan-and-publishing") {
  const input = buildAgentRunStartInput({
    workspaceId: "ws-1",
    taskId: "task-1",
    agent: { ...shipper, ...(checkIns ? { checkIns } : {}) },
    assignment: "  Ship the CSV export.  ",
    now: AGENT_RUN_NOW,
  });
  return createAgentRun({
    id: "agent-run-1",
    input,
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: AGENT_RUN_NOW,
  }).agentRun;
}

describe("run start consent", () => {
  test("a saved agent never grants permissions; every run start records its own consent", () => {
    // The agent's own permission is Auto; the run records the user's settings.
    expect(shipper.permission).toBe("auto");
    const agentRun = start("plan-and-publishing");
    expect(agentRun.consent).toEqual({ checkIns: "plan-and-publishing", permissionMode: "manual", authorizedEffectStageIds: [] });
    expect(agentRun.assignment).toBe("Ship the CSV export.");

    // The runtime derives a turn's permissions from the agent run's consent only.
    const runtimeSource = readFileSync("electron/host-service/supervision/agent-run-runtime.ts", "utf8");
    expect(runtimeSource).toContain("agentRun.consent.permissionMode");
    expect(runtimeSource).not.toMatch(/workflow\.runtime/);

    // An external effect the consent does not list always asks first.
    const openPr = agentRun.workflow.stages.findIndex((stage) => stage.id === "open-draft-pr");
    expect(resolveConsentStageSignOff(agentRun, openPr)).toBe("ask");
  });

  test("only when stuck: assigning the work is the go-ahead for the workflow's publishing stages", () => {
    const agentRun = start();
    expect(agentRun.consent.authorizedEffectStageIds).toEqual(["open-draft-pr", "watch-checks", "ready-for-review"]);
    agentRun.workflow.stages.forEach((_, index) => expect(resolveConsentStageSignOff(agentRun, index)).toBe("auto"));
  });
});
