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
const QUESTION_GOAL = "Before writing anything, ask me with your question tool which filename to use (offer A.md or B.md), then create that file with the content `answered` and report done.";
/**
 * No "do not change any file" clause: a read-only sandbox cannot run `git
 * status`, and an agent that turns the clause into a criterion it cannot
 * verify reports it unverified, which halts the stage for the user. The
 * harness checks the tree itself.
 */
const READ_ONLY_GOAL = "Read README.md and report the stage as done; the summary must quote its first line.";
/** A merged pull request with finished checks: the wait ends on its first read. */
const WAIT_PR_URL = process.env.STAVE_LIVE_WAIT_PR_URL ?? "https://github.com/sendbird/stave/pull/749";
const EVENT_WAIT_GOAL = `Call stave_wait_for_event with kind pull_request_checks and target ${WAIT_PR_URL}, then end your turn without reporting. In the turn Stave starts with what happened to that pull request, report the stage as done with a summary that states it. Do not create or change any file.`;
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
  extendAtLimit?: boolean;
  persistentQuestion?: boolean;
  workspaceCheck?: boolean;
  /** A read-only agent with a configured check: no host check is required and nothing is written. */
  readOnly?: boolean;
  /** The run waits inside itself for a pull request event and resumes on it. */
  eventWait?: boolean;
}) {
  const { providerId, testInfo } = args;
  const directory = await mkdtemp(path.join(tmpdir(), `stave-agent-run-live-${providerId}-`));
  const repositoryPath = await seedTemporaryRepository(directory);
  const stave = await launchStave({ env: args.persistentQuestion ? { STAVE_CLAUDE_APPROVAL_TIMEOUT_MS: "20000", STAVE_CODEX_APPROVAL_TIMEOUT_MS: "20000" } : {} });
  const goal = args.readOnly ? READ_ONLY_GOAL : args.eventWait ? EVENT_WAIT_GOAL
    : args.workspaceCheck ? "Make the workspace check pass: it requires OK.txt containing `ok`. Run the workspace check with your Stave tool before reporting. Do not commit." : args.persistentQuestion ? QUESTION_GOAL : GOAL;
  const writesNothing = Boolean(args.readOnly || args.eventWait);
  const evidence: Record<string, unknown> = { providerId, goal, path: "kickoff-assign" };
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
    if (args.extendAtLimit) {
      agent.tools = { maxTurns: 1 };
      agent.workflow = [
        { id: "prepare", title: "Prepare", kind: "ai", instruction: "Read README.md. Do not create HELLO.md yet. Report only this stage as done, with exactly one acceptance criterion: README.md has been read.", doneWhen: "README.md has been read." },
        { id: "work", title: "Write", kind: "ai", instruction: "Create HELLO.md containing exactly hello from stave, read it back and re-read README.md. Report this stage as done. The final report must include every earlier stage acceptance criterion as met using its text verbatim, as well as the HELLO.md criterion. Do not commit.", doneWhen: "HELLO.md contains hello from stave." },
      ];
    }
    if (args.readOnly) agent.permission = "read-only";
    if (args.eventWait) agent.instructions = "You are an implementer. Follow the assignment exactly: register the wait with stave_wait_for_event and end that turn without reporting. In the turn that follows the event, report the stage as done with the Stave reporting tool. Do not commit. Do not ask the user questions.";
    if (args.persistentQuestion) agent.instructions = "Before writing any file, use your native question tool (AskUserQuestion or request_user_input) to ask which filename to use, offering A.md and B.md. Do not guess or proceed without an answer. After the user replies, create ONLY the selected file with exactly answered, read it back, and report the stage as done. Do not ask the question again after receiving the answer. Do not commit.";
    evidence.model = model;
    await seedRepository(stave.page, {
      repositoryPath,
      settings: { customAgents: [agent], autoRoutingEnabled: false, providerTimeoutMs: 120_000, themeMode: "dark", ...args.settings },
    });
    if (args.workspaceCheck || args.readOnly) {
      await writeFile(path.join(repositoryPath, "check.sh"), '[ "$(cat OK.txt 2>/dev/null)" = "ok" ]\n');
      const configured = await stave.page.evaluate(async repositoryPath => {
        await window.api!.fs!.createDirectory!({ rootPath: repositoryPath, directoryPath: ".stave" });
        return window.api!.fs!.writeFile!({ rootPath: repositoryPath, filePath: ".stave/scripts.json", expectedRevision: null,
          content: JSON.stringify({ version: 2, actions: { check: { commands: ["sh check.sh"], target: "workspace" } } }) });
      }, repositoryPath);
      expect(configured.ok, JSON.stringify(configured)).toBe(true);
    }
    // The seeded check files are untracked; a run that writes nothing leaves exactly this status.
    const seededStatus = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" });
    // Let `hydrateWorkspaces` settle before driving the product (see the harness notes).
    await stave.page.waitForTimeout(2_000);
    const startedAt = Date.now();
    await stave.page.getByRole("button", { name: "Agents", exact: true }).click();
    await stave.page.getByRole("button", { name: new RegExp(`^${agent.name}`) }).click();
    await stave.page.getByRole("button", { name: "Assign…", exact: true }).click();
    const dialog = stave.page.getByRole("dialog", { name: "Kick off workspace" });
    await dialog.getByRole("textbox", { name: "Work source" }).fill(goal);
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
    if (args.extendAtLimit) {
      await expect.poll(async () => {
        const response = await stave.page.evaluate(async agentRunId => window.api!.agentRuns!.get({ agentRunId }), agentRunId);
        detail = response.agentRun;
        return detail?.agentRun.pauseReason;
      }, { timeout: RUN_DEADLINE_MS, intervals: [1_000, 2_000] }).toBe("limit-reached");
      expect(detail!.agentRun).toMatchObject({ state: "paused", turnCount: 1, maxTurns: 1 });
      const before = detail!;
      await expect(stave.page.getByRole("button", { name: "Extend (+10 turns)", exact: true }).first()).toBeVisible();
      const limitNotices = () => stave.page.evaluate(async agentRunId => {
        const result = await window.api!.persistence!.listNotifications!({ limit: 200 });
        return result.notifications.filter(notice => notice.payload.agentRunId === agentRunId && notice.title.includes("Limit reached"));
      }, agentRunId);
      await expect.poll(async () => (await limitNotices()).length).toBe(1);
      await stave.page.screenshot({ path: testInfo.outputPath(`${providerId}-limit.png`) });
      evidence.limitPause = before;
      const extended = await stave.page.evaluate(async agentRunId => window.api!.agentRuns!.extend({ agentRunId }), agentRunId);
      expect(extended.ok).toBe(true);
      expect(extended.agentRun?.agentRun).toMatchObject({ maxTurns: 11, turnCount: 1, fingerprint: before.agentRun.fingerprint });
      expect(extended.agentRun?.usage).toEqual(before.usage);
      evidence.limitNotifications = await limitNotices();
    }
    if (args.persistentQuestion) {
      const readQuestion = async () => stave.page.evaluate(async ({ workspaceId, taskId }) => {
        const loaded = await window.api!.persistence!.loadWorkspace!({ workspaceId });
        return (loaded.snapshot?.messagesByTask[taskId] ?? []).flatMap(message => message.parts.flatMap(part =>
          part.type === "user_input" && part.state === "input-requested" ? [{ ...part, messageId: message.id }] : []))[0] ?? null;
      }, { workspaceId, taskId });
      await expect.poll(readQuestion, { timeout: RUN_DEADLINE_MS, intervals: [500, 1_000] }).toBeTruthy();
      const original = (await readQuestion())!;
      evidence.observedQuestion = original;
      test.skip(providerId === "codex" && original.toolName === "request_user_input_async",
        "This Auto/Default Codex session used request_user_input_async; the synchronous requestUserInput timeout was not exercised.");
      await expect(stave.page.getByText(original.questions[0]!.question, { exact: true }).first()).toBeVisible();
      await expect.poll(async () => (await readQuestion())?.delivery, { timeout: 45_000, intervals: [500, 1_000] }).toBe("async");
      const waiting = await stave.page.evaluate(async agentRunId => window.api!.agentRuns!.get({ agentRunId }), agentRunId);
      detail = waiting.agentRun;
      expect(waiting.agentRun?.agentRun.state).toBe("running");
      expect(waiting.agentRun?.stages.every(stage => stage.status !== "stuck")).toBe(true);
      await expect(stave.page.getByRole("region", { name: `${agent.name}: Needs your answer · Question`, exact: true })).toBeVisible();
      const pending = (await readQuestion())!;
      expect(pending.requestId).toBe(original.requestId);
      expect(pending.state).toBe("input-requested");
      await expect.poll(async () => {
        const active = await stave.page.evaluate(async workspaceId => window.api!.persistence!.listActiveWorkspaceTurns!({ workspaceId }), workspaceId);
        return active.turns.filter(turn => turn.taskId === taskId).length;
      }, { timeout: 30_000 }).toBe(0);
      expect(existsSync(path.join(repositoryPath, "A.md"))).toBe(false);
      expect(existsSync(path.join(repositoryPath, "B.md"))).toBe(false);
      evidence.pendingQuestion = pending;
      await stave.page.screenshot({ path: testInfo.outputPath(`${providerId}-pending-question.png`) });
      const answers = Object.fromEntries(pending.questions.map(question => [question.key?.trim() || question.question, "B.md"]));
      const reply = { workspaceId, taskId, requestId: pending.requestId, answers };
      const result = await stave.page.evaluate(async reply => window.api!.localMcp!.respondUserInput!(reply), reply);
      evidence.answerResponse = result;
      expect(result.ok, JSON.stringify(result)).toBe(true);
      const duplicate = await stave.page.evaluate(async reply => window.api!.localMcp!.respondUserInput!(reply), reply);
      expect(duplicate.ok).toBe(false);
    }
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
    const helloPath = path.join(repositoryPath, args.workspaceCheck ? "OK.txt" : args.persistentQuestion ? "B.md" : "HELLO.md");
    const hello = !writesNothing && existsSync(helloPath) ? await readFile(helloPath, "utf8") : null;
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
    if (args.persistentQuestion) {
      expect(cards).toEqual([{ messageId: expect.any(String), type: "user_input", state: "input-responded" }]);
      const replyTurns = messages.filter(message => message.role === "user" && message.content.includes("B.md") && message.content.startsWith(">"));
      expect(replyTurns).toHaveLength(1);
      expect(detail!.events.filter(event => event.kind === "user-turn")).toHaveLength(1);
      expect(existsSync(path.join(repositoryPath, "A.md"))).toBe(false);
      evidence.replyTurns = detail!.events.filter(event => event.kind === "user-turn").map(event => event.detail.turnId);
    } else expect(cards, "no approval or question card may appear in an Auto run").toEqual([]);
    expect(run.origin).toBe("agent");
    // A read-only agent is not an Auto agent, so its run carries manual consent; its posture never asks anyway.
    expect(run.consent.permissionMode).toBe(args.readOnly ? "manual" : "auto");
    expect(run.fingerprint.providerId).toBe(providerId);
    expect(run.state).toBe("completed");
    expect(stage?.status).toBe("completed");
    expect(applied.length).toBeGreaterThan(0);
    for (const permission of applied) expect(permission.applied).toMatchObject(args.expectedAppliedOptions);
    if (writesNothing) {
      expect(evidence.gitStatus, "a read-only or waiting run must leave the tree untouched").toBe(seededStatus);
      expect(stage?.report?.outcome).toBe("complete");
    } else {
      expect(hello, "HELLO.md must exist").not.toBeNull();
      expect(hello!.trim()).toBe(args.workspaceCheck ? "ok" : args.persistentQuestion ? "answered" : EXPECTED_CONTENT);
    }
    if (args.readOnly) {
      const criteria = run.workflow.stages.flatMap(entry => entry.acceptanceCriteria ?? []);
      expect(criteria.some(criterion => criterion.verification === "stave-check"), "a read-only run gets no host check criterion").toBe(false);
      expect(detail!.report?.acceptanceCriteria?.some(criterion => criterion.text === "Workspace checks pass")).toBeFalsy();
      expect(stage?.facts?.workspaceScripts).toBeUndefined();
      expect(stage?.report?.outcome === "complete" ? stage.report.summary : "").toContain("Temporary agent run validation");
    }
    if (args.eventWait) {
      const waits = detail!.events.filter(event => event.kind.startsWith("wait-")).map(event => ({ kind: event.kind, detail: event.detail }));
      evidence.waits = waits;
      expect(waits.map(wait => wait.kind)).toEqual(["wait-registered", "wait-woke"]);
      expect(run.turnCount, "one turn registers the wait, the woken turn reports").toBe(2);
      expect(stage?.report?.outcome === "complete" ? stage.report.summary : "").toMatch(/749|merged|pass/i);
    }
    if (args.workspaceCheck) {
      const check = stage?.facts?.workspaceScripts?.find(check => check.source === "stave" && check.exitCode === 0);
      expect(check).toBeTruthy();
      const workflowStage = run.workflow.stages.find(entry => entry.id === stage?.stageId);
      const frozen = workflowStage?.kind === "ai" ? workflowStage.acceptanceCriteria?.flatMap(criterion => criterion.scriptDefinitions ?? []).find(definition => definition.scriptId === check?.scriptId) : null;
      expect(frozen?.definitionHash).toBeTruthy();
      expect(check!.definitionHash).toBe(frozen!.definitionHash);
      expect(check!.executedCommands).toBe("sh check.sh");
      expect(stage?.report?.outcome).toBe("complete");
      if (stage?.report?.outcome === "complete") expect(check!.verification.completedRevision).toEqual(stage.report.workspaceRevision);
      expect(detail!.report?.acceptanceCriteria).toContainEqual({ text: "Workspace checks pass", required: true, status: "met" });
    }
    expect(evidence.commits).toBe("1");
    expect(run.turnCount).toBeLessThanOrEqual(MAX_TURNS);
    if (args.extendAtLimit) {
      expect(run).toMatchObject({ turnCount: 2, maxTurns: 11 });
      const sessions = messages.filter(message => message.role === "assistant").map(message => message.nativeProviderSessionId).filter(Boolean);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(new Set(sessions).size, "both stage turns must reuse the native session").toBe(1);
      evidence.nativeSessionCount = new Set(sessions).size;
    }
    await stave.page.screenshot({ path: testInfo.outputPath(`${providerId}-completed.png`) });
  } finally {
    if (typeof evidence.workspaceId === "string" && typeof evidence.taskId === "string") {
      const loaded = await stave.page.evaluate(async workspaceId => window.api!.persistence!.loadWorkspace!({ workspaceId }), evidence.workspaceId).catch(() => null);
      messages = (loaded?.snapshot?.messagesByTask[evidence.taskId] ?? messages) as ChatMessage[];
    }
    const finalDetail = detail as AgentRunDetail | null;
    console.log(`Final ${providerId} run: ${JSON.stringify({ state: finalDetail?.agentRun.state, turnCount: finalDetail?.agentRun.turnCount, stage: finalDetail?.agentRun.currentStageIndex, stages: finalDetail?.stages.map(stage => ({ id: stage.stageId, status: stage.status, detail: stage.detail, blockReason: stage.blockReason })) })}`);
    await writeFile(testInfo.outputPath(`${providerId}-run-evidence.json`), JSON.stringify(evidence, null, 2));
    await writeFile(testInfo.outputPath(`${providerId}-run-detail.json`), JSON.stringify(detail, null, 2));
    await writeFile(testInfo.outputPath(`${providerId}-task-messages.json`), JSON.stringify(messages, null, 2));
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


test("a live Codex run halts at one turn and Extend completes its second stage", async ({}, testInfo) => {
  test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
  test.setTimeout(420_000);
  await runLiveAgentRun({
    providerId: "codex", testInfo, extendAtLimit: true,
    pickModel: models => {
      const visible = models.filter(entry => !entry.hidden);
      const requested = process.env.STAVE_LIVE_CODEX_MODEL;
      return (requested ? visible.find(entry => entry.model === requested) : visible.find(entry => entry.isDefault) ?? visible[0])?.model ?? null;
    },
    settings: { codexReasoningEffort: "low", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false },
    expectedAppliedOptions: { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" },
  });
});

for (const providerId of ["claude-code", "codex"] as const) {
  test(`live ${providerId} Run keeps a native question after timeout and delivers one reply`, async ({}, testInfo) => {
    test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
    test.setTimeout(420_000);
    await runLiveAgentRun({ providerId, testInfo, persistentQuestion: true,
      pickModel: models => providerId === "claude-code" ? process.env.STAVE_LIVE_CLAUDE_MODEL ?? "claude-haiku-5-5"
        : process.env.STAVE_LIVE_CODEX_MODEL ?? models.find(model => model.isDefault && !model.hidden)?.model ?? models.find(model => !model.hidden)?.model ?? null,
      settings: providerId === "claude-code" ? { claudeEffort: "low", claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false }
        : { codexReasoningEffort: "low", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false },
      expectedAppliedOptions: providerId === "claude-code" ? { claudePermissionMode: "auto" }
        : { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" },
    });
  });
}

for (const providerId of ["codex", "claude-code"] as const) {
  test(`live ${providerId} read-only Run completes without a host check or a card`, async ({}, testInfo) => {
    test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
    test.setTimeout(300_000);
    await runLiveAgentRun({ providerId, testInfo, readOnly: true,
      pickModel: models => providerId === "claude-code" ? process.env.STAVE_LIVE_CLAUDE_MODEL ?? "claude-haiku-5-5"
        : process.env.STAVE_LIVE_CODEX_MODEL ?? models.find(model => model.isDefault && !model.hidden)?.model ?? models.find(model => !model.hidden)?.model ?? null,
      settings: providerId === "claude-code" ? { claudeEffort: "low", claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false }
        : { codexReasoningEffort: "low", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false },
      expectedAppliedOptions: providerId === "claude-code" ? { claudePermissionMode: "dontAsk" }
        : { codexFileAccess: "read-only", codexApprovalPolicy: "never" },
    });
  });
  test(`live ${providerId} Run waits for a pull request event and resumes on it`, async ({}, testInfo) => {
    test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
    test.setTimeout(300_000);
    await runLiveAgentRun({ providerId, testInfo, eventWait: true,
      pickModel: models => providerId === "claude-code" ? process.env.STAVE_LIVE_CLAUDE_MODEL ?? "claude-haiku-5-5"
        : process.env.STAVE_LIVE_CODEX_MODEL ?? models.find(model => model.isDefault && !model.hidden)?.model ?? models.find(model => !model.hidden)?.model ?? null,
      settings: providerId === "claude-code" ? { claudeEffort: "low", claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false }
        : { codexReasoningEffort: "low", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false },
      expectedAppliedOptions: providerId === "claude-code" ? { claudePermissionMode: "auto" }
        : { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" },
    });
  });
  test(`live ${providerId} write Run completes only with a host workspace check`, async ({}, testInfo) => {
    test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
    test.setTimeout(300_000);
    await runLiveAgentRun({ providerId, testInfo, workspaceCheck: true,
      pickModel: models => providerId === "claude-code" ? process.env.STAVE_LIVE_CLAUDE_MODEL ?? "claude-haiku-5-5"
        : process.env.STAVE_LIVE_CODEX_MODEL ?? models.find(model => model.isDefault && !model.hidden)?.model ?? models.find(model => !model.hidden)?.model ?? null,
      settings: providerId === "claude-code" ? { claudeEffort: "low", claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false }
        : { codexReasoningEffort: "low", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false },
      expectedAppliedOptions: providerId === "claude-code" ? { claudePermissionMode: "auto" }
        : { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" },
    });
  });
}
