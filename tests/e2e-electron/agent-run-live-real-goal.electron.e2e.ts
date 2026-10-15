import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentConfig } from "@/lib/agents/schema";
import type { ChatMessage } from "@/types/chat";
import { launchStave, seedRepository } from "./harness/stave-app";

/**
 * Dogfood run: the built-in Implementer, on a real provider, owns a real
 * multi-part goal in a real repository and is left alone until the run ends.
 *
 * Opt-in and manual. `STAVE_LIVE_REAL_GOAL_REPO` names a disposable clone the
 * agent may change; `STAVE_LIVE_REAL_GOAL` is the goal; `STAVE_LIVE_REAL_GOAL_CHECK`
 * the workspace check command. The run starts through Agents → Assign like a
 * user's, and the spec records a timeline and screenshots instead of asserting
 * a particular diff: the point is to see where an unattended run stops.
 */
const REPO = process.env.STAVE_LIVE_REAL_GOAL_REPO ?? "";
const GOAL = process.env.STAVE_LIVE_REAL_GOAL ?? "";
const CHECK = process.env.STAVE_LIVE_REAL_GOAL_CHECK ?? "";
const PROVIDER = (process.env.STAVE_LIVE_REAL_GOAL_PROVIDER ?? "codex") as "codex" | "claude-code";
const MODEL = process.env.STAVE_LIVE_REAL_GOAL_MODEL ?? (PROVIDER === "codex" ? "gpt-6-luna" : "claude-sonnet-5-5");
const DEADLINE_MS = Number(process.env.STAVE_LIVE_REAL_GOAL_DEADLINE_MS ?? 45 * 60_000);

test("a real multi-part goal runs unattended to its end", async ({}, testInfo) => {
  test.skip(!REPO || !GOAL || !CHECK, "Requires STAVE_LIVE_REAL_GOAL_REPO, STAVE_LIVE_REAL_GOAL and STAVE_LIVE_REAL_GOAL_CHECK.");
  test.setTimeout(DEADLINE_MS + 5 * 60_000);
  // The built-in Implementer's instructions (src/lib/agents/starters.ts), pinned to one provider and this checkout.
  // Copied, not imported: the starters module pulls locale JSON the Playwright loader cannot import.
  const agent: AgentConfig = {
    version: 1,
    id: `implementer-real-goal-${PROVIDER}`,
    source: "custom",
    name: `Implementer real goal ${PROVIDER === "codex" ? "Codex" : "Claude"}`,
    description: "Implements a change end to end and verifies it.",
    instructions: [
      "You own one change from start to a verified result, working in the workspace you were given.",
      "Read enough of the surrounding code to match its conventions before editing, and keep the change inside the requested scope. Reuse what the repository already has instead of adding a parallel version, and keep the change as small as the goal allows.",
      "Run the narrowest checks that prove the change works: the relevant tests, the typecheck, and the build step the repository uses.",
      "Commit your work when it is verified. Never push to the default branch, force-push, or merge.",
      "Report what changed, the exact commands you ran and their results, and anything left unfinished.",
    ].join("\n"),
    skills: [],
    model: { mode: "fixed", providerId: PROVIDER, model: MODEL, effort: "medium" },
    tools: { maxTurns: 30 },
    permission: "auto",
    workspace: "same-workspace",
    report: ["summary", "changes", "verification", "limitations"],
    usableAs: ["primary"],
    canCall: [],
    concurrency: 1,
    archived: false,
  };
  if (process.env.STAVE_LIVE_REAL_GOAL_REVIEW === "1") {
    // Implement, then an independent read-only review of the committed change by the built-in Reviewer.
    agent.workflow = [
      { id: "work", title: "Implement", kind: "ai", instruction: "Do the assignment, run the workspace check with your Stave tool, and commit when it passes.", doneWhen: "The assignment is done, the workspace check passes and the change is committed.",
        acceptanceCriteria: [{ text: "Workspace checks pass", verification: "stave-check" }] },
      { id: "review", title: "Review", kind: "ai", agentConfigId: "reviewer", pinCommit: true,
        // The reviewer can meet this by reporting; fixing what it finds is the run's own work after the review.
        instruction: "Review the committed change against the assignment. Do not change files. Report each defect with file, line and why it is wrong; a change that satisfies a check without fixing the cause is a defect.",
        doneWhen: "The review lists each defect with file, line and reason, or says it found none." },
      { id: "fix", title: "Fix review findings", kind: "ai",
        instruction: "Read the Review stage's findings. Fix each defect at its cause, run the workspace check with your Stave tool, and commit. If the review found none, report done without changes.",
        doneWhen: "Every defect the review found is fixed and committed, and the workspace check passes.",
        acceptanceCriteria: [{ text: "Workspace checks pass", verification: "stave-check" }] },
    ];
  }
  const profileDir = testInfo.outputPath("profile");
  await mkdir(profileDir, { recursive: true });
  const stave = await launchStave({ userDataDir: profileDir });
  const timeline: Array<Record<string, unknown>> = [];
  let detail: AgentRunDetail | null = null;
  let shot = 0;
  const snap = async (label: string) => stave.page.screenshot({ path: testInfo.outputPath(`${String(shot++).padStart(3, "0")}-${label}.png`) }).catch(() => {});
  try {
    await seedRepository(stave.page, {
      repositoryPath: REPO,
      settings: PROVIDER === "codex"
        ? { customAgents: [agent], autoRoutingEnabled: false, providerTimeoutMs: 1_800_000, themeMode: "dark", codexReasoningEffort: "medium", codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexNetworkAccess: false }
        : { customAgents: [agent], autoRoutingEnabled: false, providerTimeoutMs: 1_800_000, themeMode: "dark", claudeEffort: "medium", claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false },
    });
    const configured = await stave.page.evaluate(async ({ repo, check }) => {
      await window.api!.fs!.createDirectory!({ rootPath: repo, directoryPath: ".stave" });
      return window.api!.fs!.writeFile!({ rootPath: repo, filePath: ".stave/scripts.json", expectedRevision: null,
        content: JSON.stringify({ version: 2, actions: { check: { commands: [check], target: "workspace", timeoutMs: 1_200_000 } } }) });
    }, { repo: REPO, check: CHECK });
    expect(configured.ok, JSON.stringify(configured)).toBe(true);
    await stave.page.waitForTimeout(2_000);
    const startedAt = Date.now();
    await stave.page.getByRole("button", { name: "Agents", exact: true }).click();
    await stave.page.getByRole("button", { name: new RegExp(`^${agent.name}`) }).click();
    await stave.page.getByRole("button", { name: "Assign…", exact: true }).click();
    const dialog = stave.page.getByRole("dialog", { name: "Kick off workspace" });
    await dialog.getByRole("textbox", { name: "Work source" }).fill(GOAL);
    await dialog.getByRole("combobox", { name: "Where" }).click();
    await stave.page.getByRole("option", { name: "Current workspace" }).click();
    await snap("kickoff");
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    let taskId = "", workspaceId = "", agentRunId = "";
    await expect.poll(async () => {
      const result = await stave.page.evaluate(async () => window.api!.agents!.listAssignments!({}));
      const row = result.ok ? result.value.find(entry => entry.agentConfigId === agent.id) : undefined;
      taskId = row?.taskId ?? ""; workspaceId = row?.workspaceId ?? "";
      return taskId && workspaceId;
    }, { timeout: 30_000 }).toBeTruthy();
    await expect.poll(async () => {
      const listed = await stave.page.evaluate(async workspaceId => window.api!.agentRuns!.list({ workspaceId, includeActive: true }), workspaceId);
      agentRunId = listed.agentRuns.find(run => run.leadTaskId === taskId)?.id ?? "";
      return agentRunId;
    }, { timeout: 60_000 }).toBeTruthy();
    // Open the task so the screenshots show the conversation and the Run panel.
    await stave.page.getByText(GOAL.slice(0, 30)).first().click().catch(() => {});
    let lastKey = "";
    let lastShotAt = 0;
    while (Date.now() - startedAt < DEADLINE_MS) {
      const response = await stave.page.evaluate(async agentRunId => window.api!.agentRuns!.get({ agentRunId }), agentRunId);
      detail = response.agentRun;
      const run = detail?.agentRun;
      // Stage records are per attempt; read the latest record of the current workflow stage.
      const stageId = run?.workflow.stages[run.currentStageIndex]?.id;
      const stage = detail?.stages.filter(record => record.stageId === stageId).at(-1);
      const key = JSON.stringify([run?.state, run?.pauseReason, stage?.status, stage?.blockReason, stage?.attempt, run?.turnCount, run?.eventWait?.kind ?? null]);
      if (key !== lastKey) {
        timeline.push({ atSec: Math.round((Date.now() - startedAt) / 1000), state: run?.state, pauseReason: run?.pauseReason, stopReason: run?.stopReason,
          stage: stage?.stageId, stageStatus: stage?.status, blockReason: stage?.blockReason, detail: stage?.detail, attempt: stage?.attempt, turns: run?.turnCount, wait: run?.eventWait?.kind ?? null });
        lastKey = key;
        await snap(`t${Math.round((Date.now() - startedAt) / 1000)}-${run?.state}-${stage?.status}`);
        lastShotAt = Date.now();
      } else if (Date.now() - lastShotAt > 120_000) {
        await snap(`t${Math.round((Date.now() - startedAt) / 1000)}-${run?.state}`);
        lastShotAt = Date.now();
      }
      if (!run || !["running", "paused"].includes(run.state)) break;
      // A halted stage waits for the user; record it and stop instead of waiting out the deadline.
      if (run.state === "paused" || stage?.status === "blocked" || stage?.status === "stuck") {
        await stave.page.waitForTimeout(15_000);
        const again = (await stave.page.evaluate(async agentRunId => window.api!.agentRuns!.get({ agentRunId }), agentRunId)).agentRun;
        const againStage = again?.stages.filter(record => record.stageId === again.agentRun.workflow.stages[again.agentRun.currentStageIndex]?.id).at(-1);
        if (again?.agentRun.state === run.state && againStage?.status === stage?.status && again?.agentRun.turnCount === run.turnCount) { detail = again; break; }
      }
      await stave.page.waitForTimeout(10_000);
    }
    const loaded = await stave.page.evaluate(async workspaceId => window.api!.persistence!.loadWorkspace!({ workspaceId }), workspaceId);
    const messages = (loaded.snapshot?.messagesByTask[taskId] ?? []) as ChatMessage[];
    const cards = messages.flatMap(message => message.parts.filter(part => part.type === "approval" || part.type === "user_input").map(part => ({ type: part.type, state: part.state })));
    await snap("final");
    const evidence = {
      provider: PROVIDER, model: MODEL, goal: GOAL, check: CHECK, wallSec: Math.round((Date.now() - startedAt) / 1000),
      state: detail?.agentRun.state, pauseReason: detail?.agentRun.pauseReason, stopReason: detail?.agentRun.stopReason, turns: detail?.agentRun.turnCount, maxTurns: detail?.agentRun.maxTurns,
      cards, timeline,
      stages: detail?.stages.map(stage => ({ id: stage.stageId, status: stage.status, attempt: stage.attempt, blockReason: stage.blockReason, detail: stage.detail,
        checks: stage.facts?.workspaceScripts?.map(check => ({ exitCode: check.exitCode, durationMs: check.durationMs, tail: check.outputTail?.slice(-400) })) })),
      report: detail?.report,
      gitLog: execFileSync("git", ["log", "--oneline", "-8"], { cwd: REPO, encoding: "utf8" }),
      gitStatus: execFileSync("git", ["status", "--short"], { cwd: REPO, encoding: "utf8" }),
    };
    console.log(`Real goal (${PROVIDER} ${MODEL}): state=${evidence.state} turns=${evidence.turns}/${evidence.maxTurns} cards=${cards.length} wall=${evidence.wallSec}s`);
    await writeFile(testInfo.outputPath("evidence.json"), JSON.stringify(evidence, null, 2));
    await writeFile(testInfo.outputPath("run-detail.json"), JSON.stringify(detail, null, 2));
    await writeFile(testInfo.outputPath("messages.json"), JSON.stringify(messages, null, 2));
    expect(detail?.agentRun.state).toBe("completed");
  } finally {
    await stave.close();
  }
});
