import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createAgentRunRuntime } from "../electron/host-service/supervision/agent-run-runtime";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { buildShareReportPrompt, findSlackThreadUrl, SLACK_THREAD_URL } from "../src/lib/agent-runs/report-markdown";
import { AGENT_RUN_NOW, starterWorkflow } from "./fixtures/agent-run-fixtures";

const THREAD = "https://acme.slack.com/archives/C123ABC/p1727000000123456";

function runtimeHarness() {
  const store = new AgentRunStore(new Database(":memory:"));
  const turns: Array<{ taskId: string; prompt: string; runtimeOptions: unknown }> = [];
  let busy = false;
  const runtime = createAgentRunRuntime({
    store,
    getTaskSupervisionSnapshot: async ({ taskId }) => ({
      workspaceId: "ws-1",
      taskId,
      repositoryPath: "/tmp/repo",
      exists: true,
      archived: false,
      providerId: "claude-code",
      model: "sonnet",
      activeTurnId: busy ? "t" : null,
      pendingApprovalCount: 0,
      pendingUserInputCount: 0,
    }),
    listRecentTurns: () => [],
    runSupervisedTurn: async (args) => {
      turns.push({ taskId: args.taskId, prompt: args.prompt, runtimeOptions: args.runtimeOptions });
      return { turnId: `turn-${turns.length}` };
    },
    userPermissionOptions: (providerId) =>
      providerId === "claude-code" ? { claudePermissionMode: "auto", claudeSandboxEnabled: false } : undefined,
    completeInterruptedTurn: () => true,
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveAgentRunGrant: () => null,
    resolveWorkspacePath: async () => "/tmp/repo",
    readHeadSha: async () => "abc",
    collectStageFacts: async () => ({ diff: null, commands: [], toolCalls: [], action: null }),
    now: () => AGENT_RUN_NOW,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });
  return { runtime, store, turns, setBusy: (value: boolean) => (busy = value) };
}

describe("sharing a run report to Slack", () => {
  test("recognizes thread links and asks for one reply without file changes", () => {
    expect(SLACK_THREAD_URL.test(THREAD)).toBe(true);
    expect(SLACK_THREAD_URL.test("https://example.com/archives/C1/p1")).toBe(false);
    expect(findSlackThreadUrl(`Please fix this (${THREAD}) today`)).toBe(THREAD);
    expect(findSlackThreadUrl("no link here")).toBeNull();
    const prompt = buildShareReportPrompt(THREAD, "# Run complete");
    expect(prompt).toContain(`one reply in the Slack thread ${THREAD}`);
    expect(prompt).toContain("Do not change any files.");
    expect(prompt.endsWith("# Run complete")).toBe(true);
  });

  test("an ended run's report posts through one turn on its lead task; a running one or a bad link is refused", async () => {
    const h = runtimeHarness();
    const started = await h.runtime.startAgentRun({
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      workflow: starterWorkflow("request-to-pr"),
      assignment: `Fix the export. ${THREAD}`,
      consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
    });
    const agentRunId = started.agentRun.id;
    const refusal = (work: Promise<unknown>) => work.then(() => null, (error: Error) => error.message);
    expect(await refusal(h.runtime.shareReport({ agentRunId, threadUrl: THREAD }))).toContain("once the run ends");

    await h.runtime.cancel({ agentRunId });
    const turnsBefore = h.turns.length;
    expect(await refusal(h.runtime.shareReport({ agentRunId, threadUrl: "https://example.com/x" }))).toContain("Slack thread link");

    h.setBusy(true);
    expect(await refusal(h.runtime.shareReport({ agentRunId, threadUrl: THREAD }))).toContain("in a turn");
    h.setBusy(false);

    await h.runtime.shareReport({ agentRunId, threadUrl: THREAD });
    const turn = h.turns.at(-1)!;
    expect(h.turns.length).toBe(turnsBefore + 1);
    expect(turn.taskId).toBe("task-1");
    expect(turn.prompt).toContain(THREAD);
    expect(turn.prompt).toContain("Run cancelled");
    // The ended agent run's consent no longer applies: the user's own settings do.
    expect(turn.runtimeOptions).toEqual({ claudePermissionMode: "auto", claudeSandboxEnabled: false });
    expect(h.store.listEventsByKind(agentRunId, ["report-shared"])).toHaveLength(1);
  });
});
