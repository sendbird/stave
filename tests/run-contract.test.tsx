import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { AgentRunOverview } from "../src/components/agent-runs/AgentRunOverview";
import { describeQueuedTurnDelivery } from "../src/components/session/composer-shelf/composer-shelf.utils";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { buildRunContract, resolveRunApprovalOptions, type RunContractInput } from "../src/lib/agent-runs/run-contract";
import type { Workflow } from "../src/lib/workflows/schema";

const NOW = new Date("2026-10-22T09:00:00.000Z");
const workspace = { name: "billing-fix", branch: "stave/billing-fix", worktree: true };

/** A run as the composer would start it for an agent with this workflow and permission. */
function startFor(agent: Parameters<typeof buildAgentRunStartInput>[0]["agent"]) {
  return buildAgentRunStartInput({ workspaceId: "ws", taskId: "task", agent, assignment: "", now: NOW });
}
function contractFor(start: ReturnType<typeof startFor>, patch: Partial<RunContractInput> = {}) {
  return buildRunContract({ workspace, permission: null, workflow: start.workflow, authorizedEffectStageIds: start.consent.authorizedEffectStageIds, maxTurns: start.maxTurns!, ...patch });
}

const shipWorkflow: NonNullable<Workflow["stages"]> = [
  { id: "implement", title: "Implement", kind: "ai", instruction: "Make the change.", doneWhen: "It builds.",
    acceptanceCriteria: [{ text: "Workspace checks pass (lint, test)", required: true, verification: "stave-check", scriptIds: ["lint", "test"], mode: "all" }] },
  { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
];

afterEach(() => applyAppLocale("en"));

describe("run contract", () => {
  test("a one-stage write agent: where, what it may change, when it is done and when it comes back", () => {
    const contract = contractFor(startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" }), {
      permission: "auto",
      defaultCheck: { applies: true, scriptIds: ["lint", "test"] },
    });
    expect(contract.where).toBe("billing-fix, branch stave/billing-fix, in its own worktree");
    expect(contract.change).toEqual([
      "Edits files and runs commands here; the provider's auto mode decides each action and asks you when it cannot.",
      "Writes outside the repository, credential files and irreversible remote actions still come to you.",
    ]);
    expect(contract.done[0]).toBe("When each of its 3 stages reports done: Work → Review → Fix review findings");
    expect(contract.done).toContain("Stave also runs lint or test before it finishes; one passing script is enough.");
    expect(contract.comesBack).toEqual([
      "Only when it is stuck or needs an answer.",
      "Questions it cannot settle come to you.",
      "Pauses after 30 turns until you extend it, and at a usage limit.",
    ]);
  });

  test("a read-only agent changes nothing and gets no default check; unknown scripts are said as unknown", () => {
    const readOnly = contractFor(startFor({ name: "Researcher", workflow: undefined, checkIns: undefined, permission: "read-only" }), { permission: "read-only", defaultCheck: { applies: false, scriptIds: null } });
    expect(readOnly.change).toEqual(["Reads files and runs read-only commands; it changes nothing."]);
    expect(readOnly.done.join(" ")).not.toContain("Stave also runs");
    const unknown = contractFor(startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "manual", reviewBeforeDone: "off" }), { defaultCheck: { applies: true, scriptIds: null } });
    expect(unknown.done).toEqual(["When the assignment is complete and verified.", "If the workspace has action scripts, one of them must pass before it finishes."]);
    expect(unknown.change[0]).toBe("Edits files and runs commands here without asking.");
    expect(contractFor(startFor({ name: "x", workflow: undefined, checkIns: undefined }), { workspace: { ...workspace, worktree: false, branch: null } }).where).toBe("billing-fix, in the repository folder");
  });

  test("Auto says what the run applies: a Codex without its reviewer runs with approvals off", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const auto = "Edits files and runs commands here; the provider's auto mode decides each action and asks you when it cannot.";
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true }).change[0]).toBe(auto);
    // The runtime falls back from on-request + auto_review to `never` when Codex has no reviewer.
    expect(resolveRunApprovalOptions({ providerId: "codex", permission: "auto", codexAutoReview: false })).toMatchObject({ codexApprovalPolicy: "never" });
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: false }).change[0])
      .toBe("Edits files and runs commands here without asking: this Codex has no reviewer for Auto, so its approvals are off.");
    // Claude's Auto does not depend on Codex's reviewer.
    expect(contractFor(start, { permission: "auto", providerId: "claude-code", codexAutoReview: false }).change[0]).toBe(auto);
  });

  test("checks name their rule, and publishing asks first unless the agent checks in only when stuck", () => {
    const asks = contractFor(startFor({ name: "Shipper", workflow: shipWorkflow, checkIns: "plan-and-publishing", permission: "auto" }), { permission: "auto" });
    expect(asks.done).toContain("Stave runs lint and test itself; every one must pass.");
    expect(asks.change).toContain("Outside the workspace it may also: Open draft PR, after you sign off.");
    expect(asks.comesBack).toContain("Asks you before: Open draft PR.");
    const free = contractFor(startFor({ name: "Shipper", workflow: shipWorkflow, checkIns: "when-stuck", permission: "auto" }), { permission: "auto" });
    expect(free.change).toContain("Outside the workspace it may also: Open draft PR, without asking.");
    expect(free.comesBack.join(" ")).not.toContain("Asks you before");
    const legacy = shipWorkflow.map((stage) => stage.kind === "ai" ? { ...stage, acceptanceCriteria: stage.acceptanceCriteria!.map(({ mode: _mode, ...criterion }) => criterion) } : stage);
    expect(contractFor(startFor({ name: "Shipper", workflow: legacy, checkIns: "when-stuck" })).done).toContain("Stave runs lint or test itself; one passing script is enough.");
  });

  test("the run's header shows the contract it started with, in English and Korean", () => {
    const detail = buildAgentRunFixtures(NOW).working;
    const html = renderToStaticMarkup(createElement(AgentRunOverview, { detail, now: NOW.getTime() }));
    expect(html).toContain('data-testid="run-contract-header"');
    for (const label of ["Where", "May change", "Done when", "Comes back to you"]) expect(html).toContain(label);
    applyAppLocale("ko");
    const korean = renderToStaticMarkup(createElement(AgentRunOverview, { detail, now: NOW.getTime() }));
    expect(korean).toContain("이 실행이 하는 일");
    expect(korean).toContain("돌아오는 때");
  });

  test("a queued item says how it will be delivered", () => {
    const item = { attachedFilePaths: [], attachments: [] };
    expect(describeQueuedTurnDelivery({ editing: true, turnActive: true, paused: false, canSteer: true, item })).toBe("held");
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: true, paused: false, canSteer: true, item })).toBe("steerable");
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: true, paused: false, canSteer: true, item: { ...item, attachedFilePaths: ["a.png"] } })).toBe("next-turn");
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: true, paused: true, canSteer: false, item })).toBeNull();
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: false, paused: false, canSteer: false, item })).toBeNull();
  });
});
