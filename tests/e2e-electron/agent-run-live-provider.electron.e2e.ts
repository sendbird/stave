import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type TestInfo } from "@playwright/test";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentConfig } from "@/lib/agents/schema";
import type { ChatMessage } from "@/types/chat";
import { launchStave, seedRepository } from "./harness/stave-app";

/**
 * A real Agent Run of an Auto agent, on each provider that runs agent runs.
 * No provider or IPC mocks: the installed binary and its existing sign-in do
 * the work in a throwaway repository and profile.
 *
 * The run starts the way a user starts one: Agents → the agent → Assign… →
 * the goal as the work source → Start now. Kickoff creates the task, records
 * the agent and sends the first turn through the composer's send path, which
 * starts the run with the agent's permission (`agent-run-send.ts`,
 * `buildAgentRunStartInput`). The spec never builds a start input itself.
 */
const GOAL = "Create a file named HELLO.md containing exactly `hello from stave` and report done. Do not commit.";
const EXPECTED_CONTENT = "hello from stave";
const RUN_DEADLINE_MS = 180_000;
const MAX_TURNS = 6;

type ProviderId = "codex" | "claude-code";

function buildAgent(providerId: ProviderId, model: string): AgentConfig {
  return {
    version: 1,
    id: `implementer-live-${providerId}`,
    source: "custom",
    name: `Implementer live ${providerId === "codex" ? "Codex" : "Claude"}`,
    description: "Implements one small change in the current workspace and reports it.",
    instructions: [
      "You are an implementer. Do the assignment in the current workspace with your file tools, verify the result by reading the file back,",
      "then report the stage as done with the Stave reporting tool. Do not commit. Do not ask the user questions.",
    ].join(" "),
    skills: [],
    model: { mode: "fixed", providerId, model, effort: "low" },
    tools: { maxTurns: MAX_TURNS },
    permission: "auto",
    workspace: "same-workspace",
    report: ["summary", "changes", "verification"],
    usableAs: ["primary"],
    canCall: [],
    concurrency: 1,
    archived: false,
  };
}

async function seedTemporaryRepository(directory: string) {
  const repositoryPath = path.join(directory, "repository");
  await mkdir(repositoryPath);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Temporary agent run validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize temporary repository"], { cwd: repositoryPath });
  return repositoryPath;
}

function isCardPart(part: ChatMessage["parts"][number]) {
  return part.type === "approval" || part.type === "user_input";
}

async function runLiveAgentRun(args: {
  providerId: ProviderId;
  testInfo: TestInfo;
  /** Picks the model from the live catalog; null skips the test. */
  pickModel: (models: Array<{ model: string; isDefault: boolean; hidden: boolean }>) => string | null;
  settings: Record<string, unknown>;
  expectedAppliedOptions: Record<string, unknown>;
}) {
  const { providerId, testInfo } = args;
  const directory = await mkdtemp(path.join(tmpdir(), `stave-agent-run-live-${providerId}-`));
  const repositoryPath = await seedTemporaryRepository(directory);
  const stave = await launchStave();
  const evidence: Record<string, unknown> = { providerId, goal: GOAL, path: "kickoff-assign" };
  let detail: AgentRunDetail | null = null;
  let messages: ChatMessage[] = [];
  try {
    const catalog = await stave.page.evaluate(
      async ({ providerId, cwd }) => window.api!.provider!.getModelCatalog!({ providerId, cwd }),
      { providerId, cwd: repositoryPath },
    );
    console.log(`Live ${providerId} catalog: ok=${catalog.ok} detail=${catalog.detail ?? ""} models=${catalog.models?.map((entry) => entry.model).join(",") ?? ""}`);
    test.skip(!catalog.ok, `Live ${providerId} catalog unavailable: ${catalog.detail}`);
    const model = args.pickModel(catalog.models);
    test.skip(!model, `Live ${providerId} catalog offered no usable model.`);
    const agent = buildAgent(providerId, model!);
    evidence.model = model;
    await seedRepository(stave.page, {
      repositoryPath,
      settings: { customAgents: [agent], autoRoutingEnabled: false, providerTimeoutMs: 120_000, themeMode: "dark", ...args.settings },
    });
    // Let `hydrateWorkspaces` settle before driving the product (see the harness notes).
    await stave.page.waitForTimeout(2_000);
    const startedAt = Date.now();
    await stave.page.getByRole("button", { name: "Agents", exact: true }).click();
    await stave.page.getByRole("button", { name: new RegExp(`^${agent.name}`) }).click();
    await stave.page.getByRole("button", { name: "Assign…", exact: true }).click();
    const dialog = stave.page.getByRole("dialog", { name: "Kick off workspace" });
    await dialog.getByRole("textbox", { name: "Work source" }).fill(GOAL);
    await expect(dialog.getByRole("button", { name: "Who does the work" })).toContainText(agent.name);
    // The goal must land in the seeded repository, not a new worktree.
    await dialog.getByRole("combobox", { name: "Where" }).click();
    await stave.page.getByRole("option", { name: "Current workspace" }).click();
    await expect(dialog.getByRole("combobox", { name: "Where" })).toContainText("Current workspace");
    await dialog.screenshot({ path: testInfo.outputPath(`${providerId}-kickoff.png`) });
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    // Kickoff records the assignment, then the composer send starts the run on it.
    let assignment: { taskId: string; workspaceId: string } | null = null;
    await expect.poll(async () => {
      const result = await stave.page.evaluate(async () => window.api!.agents!.listAssignments!({}));
      const row = result.ok ? result.value.find((entry) => entry.agentConfigId === agent.id) : undefined;
      assignment = row?.taskId && row.workspaceId ? { taskId: row.taskId, workspaceId: row.workspaceId } : null;
      return assignment;
    }, { timeout: 30_000, intervals: [500, 1_000] }).toBeTruthy();
    const { taskId, workspaceId } = assignment!;
    Object.assign(evidence, { taskId, workspaceId });
    let agentRunId = "";
    await expect.poll(async () => {
      const listed = await stave.page.evaluate(async (workspaceId) => window.api!.agentRuns!.list({ workspaceId, includeActive: true }), workspaceId);
      agentRunId = listed.agentRuns.find((run) => run.leadTaskId === taskId)?.id ?? "";
      return agentRunId;
    }, { timeout: 60_000, intervals: [500, 1_000] }).toBeTruthy();
    evidence.agentRunId = agentRunId;
    // Poll the run until it ends; a run that waits on an approval card never ends on its own.
    await expect.poll(async () => {
      const response = await stave.page.evaluate(async (agentRunId) => window.api!.agentRuns!.get({ agentRunId }), agentRunId);
      detail = response.agentRun;
      return detail?.agentRun.state ?? "missing";
    }, { timeout: RUN_DEADLINE_MS, intervals: [1_000, 2_000] }).not.toMatch(/^(running|paused)$/);
    const wallTimeMs = Date.now() - startedAt;
    const loaded = await stave.page.evaluate(async (workspaceId) => window.api!.persistence!.loadWorkspace!({ workspaceId }), workspaceId);
    messages = (loaded.snapshot?.messagesByTask[taskId] ?? []) as ChatMessage[];
    const cards = messages.flatMap((message) => message.parts.filter(isCardPart).map((part) => ({ messageId: message.id, type: part.type, state: part.state })));
    const notices = messages.flatMap((message) => message.parts.flatMap((part) => part.type === "system_event" ? [part.content] : []));
    const applied = messages.filter((message) => message.role === "assistant" && message.agentProvenance).map((message) => message.agentProvenance!.permission);
    const helloPath = path.join(repositoryPath, "HELLO.md");
    const hello = existsSync(helloPath) ? await readFile(helloPath, "utf8") : null;
    const run = detail!.agentRun;
    const stage = detail!.stages.find((record) => record.stageId === "work");
    Object.assign(evidence, {
      wallTimeMs, state: run.state, pauseReason: run.pauseReason, stopReason: run.stopReason, reasonDetail: run.reasonDetail,
      consent: run.consent, origin: run.origin,
      turnCount: run.turnCount, maxTurns: run.maxTurns, stage: stage ? { status: stage.status, attempt: stage.attempt, blockReason: stage.blockReason } : null,
      fingerprint: run.fingerprint, cards, notices, applied, hello,
      turnModels: [...new Set(messages.filter((message) => message.role === "assistant").map((message) => message.model))],
      gitStatus: execFileSync("git", ["status", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" }),
      commits: execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: repositoryPath, encoding: "utf8" }).trim(),
    });
    console.log(`Live agent run (${providerId}): path=kickoff-assign state=${run.state} consent=${run.consent.permissionMode} turns=${run.turnCount}/${run.maxTurns} cards=${cards.length} applied=${JSON.stringify(applied[0]?.applied ?? null)} wall=${Math.round(wallTimeMs / 1000)}s model=${model}`);
    expect(cards, "no approval or question card may appear in an Auto run").toEqual([]);
    expect(run.origin).toBe("agent");
    expect(run.consent.permissionMode).toBe("auto");
    expect(run.fingerprint.providerId).toBe(providerId);
    expect(run.state).toBe("completed");
    expect(stage?.status).toBe("completed");
    expect(applied.length).toBeGreaterThan(0);
    for (const permission of applied) expect(permission.applied).toMatchObject(args.expectedAppliedOptions);
    expect(hello, "HELLO.md must exist").not.toBeNull();
    expect(hello!.trim()).toBe(EXPECTED_CONTENT);
    expect(evidence.commits).toBe("1");
    expect(run.turnCount).toBeLessThanOrEqual(MAX_TURNS);
    await stave.page.screenshot({ path: testInfo.outputPath(`${providerId}-completed.png`) });
  } finally {
    await testInfo.attach(`${providerId}-run-evidence`, { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    await testInfo.attach(`${providerId}-run-detail`, { body: JSON.stringify(detail, null, 2), contentType: "application/json" });
    await testInfo.attach(`${providerId}-task-messages`, { body: JSON.stringify(messages, null, 2), contentType: "application/json" });
    await stave.page.screenshot({ path: testInfo.outputPath(`${providerId}-final.png`) }).catch(() => {});
    await stave.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

// Opt in: both tests use the installed provider binaries and their existing sign-ins.
test("an Auto agent run on live Codex writes HELLO.md and completes without an approval card", async ({}, testInfo) => {
  test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
  test.setTimeout(300_000);
  await runLiveAgentRun({
    providerId: "codex",
    testInfo,
    pickModel: (models) => {
      const visible = models.filter((entry) => !entry.hidden);
      const requested = process.env.STAVE_LIVE_CODEX_MODEL;
      return (requested ? visible.find((entry) => entry.model === requested) : visible.find((entry) => entry.isDefault) ?? visible[0])?.model ?? null;
    },
    settings: { codexReasoningEffort: "low", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false },
    expectedAppliedOptions: { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" },
  });
});

test("an Auto agent run on live Claude Code writes HELLO.md and completes without an approval card", async ({}, testInfo) => {
  test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
  test.setTimeout(300_000);
  await runLiveAgentRun({
    providerId: "claude-code",
    testInfo,
    pickModel: (models) => {
      // Claude reports no runtime catalog ("built-in model catalog"); the light tier is the built-in Haiku id.
      const requested = process.env.STAVE_LIVE_CLAUDE_MODEL;
      if (requested) return requested;
      const visible = models.filter((entry) => !entry.hidden);
      return visible.find((entry) => /haiku/i.test(entry.model))?.model ?? "claude-haiku-5-5";
    },
    settings: { claudeEffort: "low", claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false },
    expectedAppliedOptions: { claudePermissionMode: "auto" },
  });
});
