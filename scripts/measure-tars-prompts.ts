/** Run with `bun scripts/measure-tars-prompts.ts`. Characters, not tokenizer estimates. */
import { Database } from "bun:sqlite";
import { TarsStore } from "../electron/persistence/tars-store";
import { observeTarsContext } from "../electron/main/tars-context";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { tarsExecutionAgentInstructions, tarsRunInitialContext, tarsWorkflow } from "../electron/host-service/tars-execution";
import { teamLimitsContextPart } from "../electron/host-service/supervision/team-limits-context";
import { buildAgentRunBriefing, buildAgentRunTurnContextPart, compileAgentRunStagePrompt } from "../src/lib/agent-runs/briefing";
import { createAgentRun, type AgentRunAggregate } from "../src/lib/agent-runs/domain";
import { compileAgent, snapshotAgent } from "../src/lib/agents/compile";
import { BUILTIN_AGENTS, getBuiltinAgent } from "../src/lib/agents/starters";
import { tarsPlannerAgents } from "../src/lib/tars/agents";
import { buildCanonicalConversationRequest } from "../src/lib/providers/canonical-request";
import { buildCodexPromptFromConversation } from "../src/lib/providers/provider-request-translators";
import type { AdaptiveRunPolicy, AgentResourceSnapshot } from "../src/lib/agent-runs/resources";
import type { TarsMessage } from "../src/lib/tars/conversation";
import type { CanonicalRetrievedContextPart } from "../src/lib/providers/provider.types";

const NOW = "2026-11-12T00:00:00.000Z";
const LATER = "2026-11-12T00:12:00.000Z";
// i18n-ignore: model-facing measurement fixture, never displayed as UI copy
const MANDATE = [
  "Add normalizeTaskLabel(value: string): string in src/lib/task-label.ts and a focused unit test. Trim surrounding whitespace, collapse internal whitespace to a single space, preserve Korean characters and case, and return an empty string for whitespace-only input.",
  "The helper will later be used by an import path. Do not wire it into the renderer or change existing labels in this task. Keep the function pure: no filesystem, network, account or store access. Reuse nearby test conventions and avoid new dependencies. Cover spaces, tabs, line breaks, empty input, and mixed Korean and English input.",
  "Read the repository instructions first. Preserve unrelated edits and do not change public APIs beyond this helper. Run the focused test and the required repository checks, report exact commands, exit codes and unverified scope. If a check is unavailable, explain the evidence limit instead of marking the requirement verified.",
  "Keep work on the isolated execution branch. Do not push, publish a pull request, merge, deploy, spend money or contact anyone. Complete the implementation and review locally; Tars can offer publication afterwards. The other responsibilities in the portfolio explain priorities only and do not authorize changes in their repositories.",
].join("\n\n");

/** Real builders on deterministic saved data: three responsibilities, three exchanges and two repositories. */
export function tarsPromptFixture() {
  const database = new Database(":memory:");
  try {
    const tars = new TarsStore(database);
    const row = tars.create({ requestId: "labels", title: "Normalize imported task labels", mandate: MANDATE,
      instruction: "Add and test the pure normalizeTaskLabel helper. Preserve case and Korean characters; trim and collapse whitespace. No renderer integration or publication.",
      acceptanceCriteria: ["Whitespace is trimmed and collapsed without changing case or Korean characters.", "Focused tests cover spaces, tabs, newlines, empty and Korean input."],
      repositoryPath: "/tmp/project", workspaceId: "source", providerId: "codex", maxTurns: 16 }, NOW);
    for (const [id, title] of [["export", "Review CSV export checks"], ["guide", "Prepare onboarding guide"]]) {
      tars.create({ requestId: id!, title: title!, instruction: `Investigate ${title}.`, acceptanceCriteria: ["Report evidence and remaining work."],
        repositoryPath: "/tmp/docs", workspaceId: "docs-source", providerId: "codex" }, NOW);
    }
    const plannerContext = { ...observeTarsContext({ tars,
      loadRepositoryRegistry: () => [
        { repositoryPath: "/tmp/project", repositoryName: "Project", workspaces: [{ id: "source", name: "Main", updatedAt: NOW }] },
        { repositoryPath: "/tmp/docs", repositoryName: "Docs", workspaces: [{ id: "docs-source", name: "Docs main", updatedAt: NOW }] },
      ], loadWorkspaceShellSummary: () => null, agentRuns: { getLatestAgentRunForTask: () => null } }, NOW),
      cwd: "/tmp/profile/representative", clock: { utc: NOW, timezone: "Asia/Seoul", local: "2026-11-12T09:00", weekday: 4 },
      agents: tarsPlannerAgents({ agents: BUILTIN_AGENTS, allowedAgentIds: [], executionProviderId: "codex", executionModel: null }) };
    const message = (id: string, text: string): TarsMessage => ({ id, requestId: id, text, providerId: "codex", model: "gpt-6.1-sol", maxTurns: 16,
      state: "answered", revision: 2, reply: "I will verify the local result.", error: null, decision: { reply: "I will verify the local result.", actions: [] }, createdAt: NOW, updatedAt: NOW });
    const history = [message("earlier-1", "Keep the export review separate."), message("earlier-2", "The onboarding guide can wait."), message("earlier-3", "Prioritize the import helper.")];
    const planner = buildTarsPlannerPrompt(message("current", MANDATE), plannerContext, history);
    const initialContext = tarsRunInitialContext(row, { representative: "Tars", responsibilities: tars.snapshot().responsibilities.filter((item) => item.id !== row.id)
      .map(({ title, state, priority }) => ({ title, state, priority })) });
    const workflow = tarsWorkflow(row, NOW);
    const change = createAgentRun({ id: "measurement-run", input: { workspaceId: "execution", leadTaskId: "lead", origin: "agent", workflow,
      assignment: row.instruction, initialContext, maxTurns: 16, consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
      repositoryPath: row.repositoryPath, fingerprint: { providerId: "codex", model: "gpt-6.1-sol" }, now: new Date(NOW) });
    const aggregate: AgentRunAggregate = { agentRun: { ...change.agentRun, turnCount: 1 }, stages: change.upserts.map((record) => ({ ...record, status: "running", startedAt: NOW })) };
    const supervisor = getBuiltinAgent("supervisor")!;
    const instructions = tarsExecutionAgentInstructions(supervisor.instructions, row);
    const compiled = compileAgent({ snapshot: snapshotAgent({ ...supervisor, name: "Tars", instructions, tools: { ...supervisor.tools, maxTurns: 16 },
      canCall: supervisor.canCall?.filter((id) => id !== "shipper"), reviewBeforeDone: "off" }), role: "primary", providerId: "codex" });
    if (!compiled.ok || compiled.compiled.role !== "primary") throw new Error("Cannot compile the measurement agent.");
    const agentInstructions = compiled.compiled.instructions;
    const policy: AdaptiveRunPolicy = { version: 2, profile: "balanced", providerId: "codex", allowedModels: ["gpt-6.1-sol", "gpt-6.1-terra"],
      modelLocked: false, effortLocked: false, initialEffort: "high", teamTurns: 16, concurrentHelpers: 3, totalHelpers: 8, parentReserve: 1, maxChanges: 2, cooldownTurns: 2 };
    function turn(later: boolean, primed = later) {
      const current: AgentRunAggregate = later ? { ...aggregate, agentRun: { ...aggregate.agentRun, turnCount: 4 },
        stages: aggregate.stages.map((record) => ({ ...record, detail: "Implementation written; verify the focused regression and final revision." })) } : aggregate;
      const stagePrompt = compileAgentRunStagePrompt(current);
      const runContext = buildAgentRunTurnContextPart({ aggregate: current, reason: later ? "continue-after-user" : "stage-start" });
      const budget: AgentResourceSnapshot = { rootRunId: "measurement-run", policy, reservations: [], teamTurns: 16, spent: later ? 4 : 1, reserved: 0, remaining: later ? 12 : 15,
        activeHelpers: 0, helpersLaunched: 0 };
      const teamContext = teamLimitsContextPart(policy, budget, `measurement-run:work:1:turn:${later ? 4 : 1}`, {
        codex: { status: "headroom", usedPercent: later ? 32 : 25, observedAt: later ? LATER : NOW },
        "claude-code": { status: "headroom", usedPercent: 20, observedAt: later ? LATER : NOW },
      });
      const contexts: CanonicalRetrievedContextPart[] = [runContext, teamContext, ...(initialContext.retrievedContextParts ?? [])];
      // Same Tars-owned order as runTask; ambient task/memory context and provider-owned prompts are excluded.
      const request = buildCanonicalConversationRequest({ providerId: "codex", workspaceId: "execution", taskId: "lead", history: [], userInput: stagePrompt, retrievedContextParts: contexts,
        nativeSessionId: primed ? "native-measurement" : null });
      const prompt = buildCodexPromptFromConversation({ conversation: request, fallbackPrompt: stagePrompt, activeResumeSessionId: primed ? "native-measurement" : null });
      const briefing = buildAgentRunBriefing(current);
      const sizes = { agentInstructions: agentInstructions.length, supervisor: supervisor.instructions.length, tarsInstructions: instructions.length - supervisor.instructions.length - 2,
        workflowPurpose: workflow.purpose.length, workflowConstraints: workflow.constraints?.length ?? 0,
        stageInstruction: workflow.stages[0]?.kind === "ai" ? workflow.stages[0].instruction.length : 0, stagePrompt: stagePrompt.length,
        mandate: MANDATE.length, portfolio: initialContext.retrievedContextParts?.find((part) => part.sourceId === "tars:portfolio")?.content.length ?? 0,
        initialContextSent: contexts.slice(2).filter((part) => prompt.includes(part.content)).reduce((sum, part) => sum + part.content.length, 0),
        runContext: runContext.content.length, teamContext: teamContext.content.length,
        briefingToolResponse: JSON.stringify(briefing).length, acceptanceInStage: JSON.stringify(workflow.stages[0]?.kind === "ai" ? workflow.stages[0].acceptanceCriteria : []).length,
        renderedPrompt: prompt.length, total: agentInstructions.length + prompt.length };
      return { stagePrompt, runContext, teamContext, request, prompt, agentInstructions, sizes };
    }
    return { planner, plannerContext, history, message: message("current", MANDATE), aggregate, first: turn(false), later: turn(true), coldLater: turn(true, false) };
  } finally { database.close(); }
}

if (import.meta.main) {
  const fixture = tarsPromptFixture();
  const boundary = fixture.planner.lastIndexOf("\n\n{");
  const data = JSON.parse(fixture.planner.slice(boundary + 2)) as Record<string, unknown>;
  console.log(JSON.stringify({ units: "UTF-16 characters; overlapping breakdown rows are not additive", exclusions: "Provider system prompts, tools, repository files, conversation/tool history, ambient task context, attachments and optional briefing tool calls",
    planner: { instructions: boundary, data: fixture.planner.length - boundary - 2, total: fixture.planner.length,
      components: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value).length])) },
    execution: { first: fixture.first.sizes, laterPrimed: fixture.later.sizes, laterCold: fixture.coldLater.sizes } }, null, 2));
}
