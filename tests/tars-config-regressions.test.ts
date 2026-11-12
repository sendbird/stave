import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tarsExecutionAgentInstructions, tarsWorkflow } from "../electron/host-service/tars-execution";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { compileStagePrompt } from "../src/lib/workflows/stage-prompt";
import { CreateTarsResponsibilityInputSchema, TARS_DEFAULT_MAX_TURNS, type TarsResponsibility } from "../src/lib/tars/types";
import { classifyStageEvidence, isVerifiedEvidence } from "../src/lib/agent-runs/evidence";
import type { CompleteStageReport, StageFacts } from "../src/lib/agent-runs/domain";
import { resolveDelegationProvider } from "../src/lib/runs/delegation-provider";
import { readTarsCheckCommandRules, withTarsReviewerCheckCommands } from "../electron/host-service/tars-check-commands";
import { resolveDelegationPermissionPolicy } from "../src/lib/runs/delegation-policy";
import { TARS_INSPECTION_ROUNDS } from "../electron/main/tars-inspections";
import { TARS_PLANNER_ATTEMPTS } from "../electron/main/tars-planner";

const row = { id: "goal", model: null, agentId: "implementer", acceptanceCriteria: ["Works"] } as TarsResponsibility;
const workflow = tarsWorkflow(row, "2026-11-12T00:00:00.000Z");
const prompt = (stageIndex: number) => compileStagePrompt({ workflow, stageIndex, assignment: "Fix search", priorStages: [], acceptanceCriteria: [], attempt: 1 });
const lead = (model: string | null = null) => tarsExecutionAgentInstructions(getBuiltinAgent("supervisor")!.instructions, { ...row, model });
const instruction = (index: number) => { const stage = workflow.stages[index]; return stage?.kind === "ai" ? stage.instruction : ""; };

test("1: helper and unstructured Claude checks remain unverified; work and fix tell the lead how to obtain recorded evidence", () => {
  const report = { turnId: "lead", evidence: [{ kind: "check", command: "bun test", label: "Passed" }] } as CompleteStageReport;
  for (const command of [
    { turnId: "helper", exitCode: 0, provenance: "provider-structured", outcome: "succeeded" },
    { turnId: "lead", exitCode: null, outcome: "unknown" },
  ]) {
    const facts = { currentTurnId: "lead", commands: [{ command: "bun test", sourceRevision: { status: "known", revision: "head" }, ...command }],
      toolCalls: [], workspaceRevision: { status: "known", revision: "head" } } as unknown as StageFacts;
    expect(classifyStageEvidence(report, facts).some(isVerifiedEvidence)).toBe(false);
  }
  for (const index of [0, 2]) {
    expect(prompt(index)).toContain("through `stave_run_workspace_script` when workspace check scripts are configured");
    expect(prompt(index)).toContain("same turn you report");
    expect(prompt(index)).toContain("Rerun helper checks");
    expect(prompt(index)).toContain("in this reporting turn in a way Stave recorded");
  }
});

test("2: newly admitted Tars work defaults to the Supervisor's 60 turns and preserves explicit budgets", () => {
  const input = { requestId: "test", title: "Fix", instruction: "Fix search", acceptanceCriteria: ["Works"], workspaceId: "w", repositoryPath: "/tmp/repository", providerId: "codex" };
  expect(TARS_DEFAULT_MAX_TURNS).toBe(getBuiltinAgent("supervisor")!.tools.maxTurns);
  expect(CreateTarsResponsibilityInputSchema.parse(input).maxTurns).toBe(60);
  expect(CreateTarsResponsibilityInputSchema.parse({ ...input, maxTurns: 17 }).maxTurns).toBe(17);
  expect(readFileSync(new URL("../src/components/tars/TarsView.tsx", import.meta.url), "utf8")).toContain("maxTurns: TARS_DEFAULT_MAX_TURNS");
});

test("3: pinned review guidance names explicit routing fields which override the reviewer's other-provider preference", () => {
  const reviewer = getBuiltinAgent("reviewer")!;
  expect(resolveDelegationProvider({ agentModel: reviewer.model, parentProviderId: "codex" })).toMatchObject({ providerId: "claude-code" });
  expect(lead("gpt-6.1-sol")).toContain('including when passing `agentConfigId: "reviewer"`');
  expect(lead("gpt-6.1-sol")).toContain("Pass `provider` and `model` explicitly");
  expect(resolveDelegationProvider({ agentModel: reviewer.model, parentProviderId: "codex", explicit: "codex" })).toMatchObject({ ok: true, providerId: "codex" });
});

test("4: assembled Tars lead removes Supervisor shipping and conflicting UI/logic provider prescriptions", () => {
  expect(getBuiltinAgent("supervisor")!.instructions).toContain("through Shipper");
  expect(lead()).not.toContain("through Shipper");
  expect(lead()).not.toContain("Starting points:");
  expect(lead()).not.toContain("visual findings go to Claude");
  expect(lead()).not.toContain("these Tars rules win");
  expect(lead()).toContain("Route by usage, capability, then continuity");
});

test("5: assigned work remains delegated while integration, commits and final checks belong to the lead", () => {
  expect(prompt(0)).toContain('agentConfigId: "implementer"');
  expect(prompt(0)).not.toContain("Do not do the stage's work yourself");
  expect(prompt(0)).toContain("Integrating accepted changes, committing and running final checks are the lead's job");
});

test("6: reviewer with no allowed check scripts gets conditional verification and no routing assignment", () => {
  expect(readTarsCheckCommandRules("/tmp/missing-tars-config-checkout")).toEqual([]);
  const policy = resolveDelegationPermissionPolicy({ providerId: "claude-code", access: "read-only" });
  expect(withTarsReviewerCheckCommands(policy, { agentConfigId: "reviewer", checkout: "/tmp/no-scripts", readRules: () => [] })).toBe(policy);
  expect(instruction(1)).toContain("only when your read-only policy permits those exact commands");
  expect(instruction(1)).toContain("report the check limitation");
  expect(instruction(1)).not.toContain("provider that did not write");
  expect(instruction(1)).not.toContain("provider and model the user pinned");
});

test("7: all Tars delegation entry points include the helper no-publish brief rule", () => {
  expect(lead()).toContain("In every helper brief, including in-turn subagents and the reviewer, include: do not push or open pull requests");
  expect(instruction(0)).toContain("Helper briefs: do not push or open pull requests");
  expect(instruction(1)).toContain("Do not push or open pull requests");
});

test("8: Tars claims cover execution commits, bounded rounds/retries and logical automatic turns", () => {
  const docs = readFileSync(new URL("../docs/features/tars.md", import.meta.url), "utf8");
  expect((TARS_INSPECTION_ROUNDS + 1) * TARS_PLANNER_ATTEMPTS).toBe(6);
  expect(docs).not.toContain("Delegated work does not commit");
  expect(docs.replace(/\s+/g, " ")).toContain("Delegated work commits verified changes on its execution branch");
  expect(docs).toContain("up to six provider attempts");
  expect(docs).toContain("one automatic turn even when it uses inspection rounds or transient retries");
  expect(docs).toContain("saved automatic action records and");
});
