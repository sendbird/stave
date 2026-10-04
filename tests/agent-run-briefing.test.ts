import { describe, expect, test } from "bun:test";
import { createLocalMcpReachabilityProbe } from "../electron/host-service/supervision/local-mcp-reachability";
import {
  buildAgentRunBriefing,
  buildAgentRunTurnContextPart,
  collectAcceptanceCriteria,
  compileAgentRunStagePrompt,
  agentRunPermissionRuntimeOptions,
} from "../src/lib/agent-runs/briefing";
import { extractStageFacts, parseDiffShortStat } from "../src/lib/agent-runs/facts";
import { requestStageChanges } from "../src/lib/agent-runs/commands";
import { applyChange, COMPLETE_REPORT, agentRunFixture } from "./fixtures/agent-run-fixtures";

/** The Request → PR fixture with Understand completed and Build current. */
function atBuild() {
  const aggregate = agentRunFixture();
  const understand = aggregate.stages[0]!;
  return {
    agentRun: { ...aggregate.agentRun, currentStageIndex: 1 },
    stages: [
      { ...understand, status: "completed" as const, report: COMPLETE_REPORT, reportRevision: 1 },
      {
        ...understand,
        stageId: "build",
        status: "running" as const,
        report: null,
        reportRevision: 0,
      },
    ],
  };
}

describe("run briefing", () => {
  test("a stage prompt carries earlier summaries and criteria but no ids", () => {
    const aggregate = atBuild();
    const prompt = compileAgentRunStagePrompt(aggregate);
    expect(prompt).toContain("Stage 2 of 6: Build");
    expect(prompt).toContain("**Understand:** Restated the request and wrote criteria.");
    expect(prompt).toContain("- [unverified] Export button exists");
    expect(prompt).not.toContain(aggregate.agentRun.id);
    expect(collectAcceptanceCriteria(aggregate)).toEqual(COMPLETE_REPORT.acceptanceCriteria);
  });

  test("Ask for changes reruns the earlier stage with the feedback in its prompt", () => {
    const aggregate = atBuild();
    const signOff = {
      ...aggregate,
      stages: aggregate.stages.map((record) =>
        record.stageId === "build" ? { ...record, status: "awaiting-sign-off" as const } : record,
      ),
    };
    const change = requestStageChanges({
      aggregate: signOff,
      expected: { stageId: "build", attempt: 1 },
      feedback: "Export only the visible columns.",
      now: new Date("2026-09-26T11:00:00.000Z"),
    });
    const prompt = compileAgentRunStagePrompt(applyChange(signOff, change));
    expect(prompt).toContain("## Attempt 2");
    expect(prompt).toContain("Export only the visible columns.");
  });

  test("the briefing and the context part name the stage, never the run id", () => {
    const aggregate = atBuild();
    const briefing = buildAgentRunBriefing(aggregate);
    expect(briefing.currentStage).toMatchObject({ position: 2, title: "Build", attempt: 1 });
    expect(briefing.stages.map((stage) => stage.status).slice(0, 2)).toEqual([
      "completed",
      "running",
    ]);
    const part = buildAgentRunTurnContextPart({ aggregate, reason: "continue-after-user" });
    expect(part.content).toContain("Stage 2 of 6: Build, attempt 1.");
    expect(part.content).toContain("The user replied");
    expect(JSON.stringify({ briefing, part })).not.toContain(aggregate.agentRun.id);
  });

  test("the context part names an agent run's agent and a legacy run's workflow", () => {
    const legacy = atBuild();
    const name = legacy.agentRun.workflow.name;
    expect(buildAgentRunTurnContextPart({ aggregate: legacy, reason: "stage-start" }).content).toContain(
      `Workflow: ${name}. Stage 2 of 6: Build, attempt 1.`,
    );
    const agentOrigin = { ...legacy, agentRun: { ...legacy.agentRun, origin: "agent" as const } };
    const content = buildAgentRunTurnContextPart({ aggregate: agentOrigin, reason: "stage-start" }).content;
    expect(content).toContain("A Stave agent run started this turn.");
    expect(content).toContain(`Agent: ${name}. Workflow stage 2 of 6: Build, attempt 1.`);
  });

  test("permission modes map onto each runtime", () => {
    expect(agentRunPermissionRuntimeOptions("codex", "auto")).toEqual({ codexApprovalPolicy: "never" });
    expect(agentRunPermissionRuntimeOptions("codex", "guided")).toEqual({
      codexApprovalPolicy: "untrusted",
    });
    expect(agentRunPermissionRuntimeOptions("claude-code", "auto")).toEqual({
      claudePermissionMode: "bypassPermissions",
      claudeAllowDangerouslySkipPermissions: true,
    });
    expect(agentRunPermissionRuntimeOptions("claude-code", "manual")).toEqual({});
  });

  test("Your settings (manual) runs with the user's provider settings, and only manual does", () => {
    const claudeSettings = { claudePermissionMode: "auto" as const, claudeSandboxEnabled: false };
    expect(agentRunPermissionRuntimeOptions("claude-code", "manual", claudeSettings)).toEqual(claudeSettings);
    const codexSettings = { codexApprovalPolicy: "never" as const, codexFileAccess: "danger-full-access" as const };
    expect(agentRunPermissionRuntimeOptions("codex", "manual", codexSettings)).toEqual(codexSettings);
    // Auto and Guided keep their explicit consent; user settings never widen them.
    expect(agentRunPermissionRuntimeOptions("codex", "guided", codexSettings)).toEqual({
      codexApprovalPolicy: "untrusted",
    });
    expect(agentRunPermissionRuntimeOptions("claude-code", "guided", claudeSettings)).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
    });
  });
});

describe("stage facts", () => {
  const tool = (patch: Record<string, unknown>) => ({
    type: "tool_use",
    toolUseId: "call-1",
    toolName: "Bash",
    input: JSON.stringify({ command: "bun test", description: "Run tests" }),
    state: "output-available",
    ...patch,
  });

  test("reads commands and tool calls from this stage's turns only", () => {
    const facts = extractStageFacts({
      turnIds: new Set(["turn-1", "turn-2"]),
      diff: { filesChanged: 2, insertions: 10, deletions: 1 },
      messages: [
        { turnId: "turn-0", parts: [tool({ toolUseId: "old" })] },
        {
          turnId: "turn-1",
          parts: [
            tool({}),
            tool({ toolUseId: "call-2", toolName: "bash", input: "bun run lint", state: "output-error" }),
            tool({ toolUseId: "call-3", toolName: "Read", input: "{\"file_path\":\"a.ts\"}" }),
            tool({ toolUseId: "call-4", state: "input-available" }),
            { type: "text", text: "done" },
          ],
        },
        { turnId: "turn-1", parts: [tool({})] },
      ],
    });
    expect(facts.commands).toEqual([
      { command: "bun test", exitCode: null, toolCallId: "call-1", turnId: "turn-1", outcome: "unknown" },
      { command: "bun run lint", exitCode: null, toolCallId: "call-2", turnId: "turn-1", outcome: "failed" },
    ]);
    expect(facts.toolCalls).toEqual([
      { toolCallId: "call-1", name: "Bash", ok: true, turnId: "turn-1" },
      { toolCallId: "call-2", name: "bash", ok: false, turnId: "turn-1" },
      { toolCallId: "call-3", name: "Read", ok: true, turnId: "turn-1" },
    ]);
    expect(facts.diff).toEqual({ filesChanged: 2, insertions: 10, deletions: 1 });
  });

  test("parses git's short diff statistics", () => {
    expect(parseDiffShortStat(" 3 files changed, 12 insertions(+), 4 deletions(-)\n")).toEqual({
      filesChanged: 3,
      insertions: 12,
      deletions: 4,
    });
    expect(parseDiffShortStat(" 1 file changed, 1 deletion(-)")).toEqual({
      filesChanged: 1,
      insertions: 0,
      deletions: 1,
    });
    expect(parseDiffShortStat("")).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
    expect(parseDiffShortStat("fatal: bad revision")).toBeNull();
  });
});

describe("Local MCP reachability", () => {
  const manifest = { url: "http://127.0.0.1:39517/mcp", healthUrl: "http://127.0.0.1:39517/health" };

  test("asks the health endpoint and caches the answer briefly", async () => {
    let clock = 0;
    const requested: string[] = [];
    let healthy = true;
    const probe = createLocalMcpReachabilityProbe({
      readManifest: async () => manifest,
      fetch: (async (url: URL) => {
        requested.push(String(url));
        return new Response(null, { status: healthy ? 200 : 503 });
      }) as unknown as typeof fetch,
      now: () => clock,
      cacheMs: 1_000,
    });
    expect(await probe.isReachable()).toBe(true);
    healthy = false;
    expect(await probe.isReachable()).toBe(true);
    clock = 1_000;
    expect(await probe.isReachable()).toBe(false);
    expect(requested).toEqual([manifest.healthUrl, manifest.healthUrl]);
    healthy = true;
    probe.invalidate();
    expect(await probe.isReachable()).toBe(true);
  });

  test("is unreachable without a manifest or when the request fails", async () => {
    const missing = createLocalMcpReachabilityProbe({ readManifest: async () => null });
    expect(await missing.isReachable()).toBe(false);
    const failing = createLocalMcpReachabilityProbe({
      readManifest: async () => manifest,
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(await failing.isReachable()).toBe(false);
  });
});
