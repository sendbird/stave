import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentConfig } from "@/lib/agents/schema";
import { launchStave, seedRepository } from "./harness/stave-app";

/**
 * A usage limit in a real Agent Run, reproduced without spending a real
 * account: a stand-in `claude` CLI (`harness/fake-claude-cli.cjs`) ends the
 * run's first turn at a five-hour limit that resets five seconds later, and a
 * fixture file stands in for the account usage window Stave reads
 * (`STAVE_E2E_ACCOUNT_USAGE_FILE`). Everything between is the product: the
 * run pauses on the limit with a resume time, reads the window when the time
 * comes, waits again while the window is still used up, and continues the
 * stage on its own with a resume turn once it has room.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const GOAL = "Create a file named HELLO.md containing hello and report done.";

type FakeTurn = { at: string; runTurn: boolean; resumed: boolean };

function buildAgent(): AgentConfig {
  return {
    version: 1, id: "implementer-usage-limit", source: "custom", name: "Implementer usage limit",
    description: "Implements one small change and reports it.",
    instructions: "Do the assignment and report the stage with the Stave reporting tool.",
    skills: [], model: { mode: "fixed", providerId: "claude-code", model: "sonnet" }, tools: { maxTurns: 4 },
    permission: "auto", workspace: "same-workspace", report: ["summary"], usableAs: ["primary"], canCall: [],
    concurrency: 1, archived: false,
  };
}

/** The window Stave reads: `usedPercent` of the five-hour window, reset at `resetsAt` (epoch seconds). */
async function setUsageWindow(file: string, usedPercent: number, resetsAt: number) {
  await writeFile(file, JSON.stringify({ claude: { session: { usedPercent, resetsAt } } }));
}

/** The run turns the stand-in answered, in order. */
async function readRunTurns(fakeDir: string): Promise<FakeTurn[]> {
  const file = path.join(fakeDir, "turns.jsonl");
  if (!existsSync(file)) return [];
  return (await readFile(file, "utf8")).split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as FakeTurn).filter((turn) => turn.runTurn);
}

async function kickOff(page: Page, agentName: string, outputPath: string) {
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${agentName}`) }).click();
  await page.getByRole("button", { name: "Assign…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Kick off workspace" });
  await dialog.getByRole("textbox", { name: "Work source" }).fill(GOAL);
  await dialog.getByRole("combobox", { name: "Where" }).click();
  await page.getByRole("option", { name: "Current workspace" }).click();
  await dialog.screenshot({ path: outputPath });
  await dialog.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
}

test("a run that hits a usage limit waits for the reset and continues on its own", async ({}, testInfo) => {
  test.setTimeout(360_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-usage-limit-"));
  const fakeDir = path.join(directory, "fake-claude");
  const usageFile = path.join(directory, "usage.json");
  let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
  let detail: AgentRunDetail | null = null;
  try {
    const repositoryPath = path.join(directory, "repository");
    await mkdir(repositoryPath); await mkdir(fakeDir);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    await writeFile(path.join(repositoryPath, "README.md"), "Usage limit validation.\n");
    execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
    // The CLI Stave launches: this test's Node running the stand-in, with its state directory.
    const wrapper = path.join(fakeDir, "claude");
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
    await chmod(wrapper, 0o755);
    // Room to work until the stand-in reports the limit.
    await setUsageWindow(usageFile, 10, Math.floor(Date.now() / 1000) + 3600);
    const profileDir = path.join(directory, "profile");
    await mkdir(profileDir);
    stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper, STAVE_E2E_ACCOUNT_USAGE_FILE: usageFile } });
    const page = stave.page;
    const agent = buildAgent();
    await seedRepository(page, { repositoryPath, settings: { customAgents: [agent], autoRoutingEnabled: false, themeMode: "dark" } });
    await page.waitForTimeout(2_000);
    await kickOff(page, agent.name, testInfo.outputPath("kickoff.png"));

    let agentRunId = "";
    await expect.poll(async () => {
      const listed = await page.evaluate(async () => {
        const workspaces = await window.api!.persistence!.listWorkspaces!();
        const runs = await Promise.all(workspaces.rows.map((row) => window.api!.agentRuns!.list({ workspaceId: row.id, includeActive: true })));
        return runs.flatMap((result) => result.agentRuns);
      });
      agentRunId = listed[0]?.id ?? "";
      return agentRunId;
    }, { timeout: 60_000, intervals: [500, 1_000] }).toBeTruthy();
    const read = async () => {
      const response = await page.evaluate(async (id) => window.api!.agentRuns!.get({ agentRunId: id }), agentRunId);
      detail = response.agentRun;
      return detail;
    };
    const resumeTurns = (run: AgentRunDetail | null) =>
      run?.events.filter((event) => event.kind === "turn-started" && event.detail.reason === "resume-after-usage-limit") ?? [];

    // The first turn ends at the limit: the run pauses with a resume time a minute past the reset.
    await expect.poll(async () => (await read())?.agentRun.pauseReason, { timeout: 60_000, intervals: [500, 1_000] }).toBe("usage-limit");
    const paused = detail!;
    expect(paused.agentRun.state).toBe("paused");
    const firstResumeAt = paused.agentRun.usageLimit?.resumeAt ?? "";
    expect(Date.parse(firstResumeAt)).toBeGreaterThan(Date.now());
    await page.screenshot({ path: testInfo.outputPath("usage-limit-paused.png") });

    // The window is still used up at that time: Stave reads it and waits for the new reset instead of resuming.
    await setUsageWindow(usageFile, 100, Math.floor(Date.parse(firstResumeAt) / 1000) + 30);
    await expect.poll(async () => (await read())?.agentRun.usageLimit?.resumeAt ?? "", { timeout: 120_000, intervals: [2_000, 5_000] })
      .not.toBe(firstResumeAt);
    const waitedAgain = detail!;
    expect(waitedAgain.agentRun.pauseReason).toBe("usage-limit");
    const secondResumeAt = waitedAgain.agentRun.usageLimit?.resumeAt ?? "";
    expect(Date.parse(secondResumeAt)).toBeGreaterThan(Date.parse(firstResumeAt));
    expect(resumeTurns(waitedAgain)).toHaveLength(0);
    expect(await readRunTurns(fakeDir)).toHaveLength(1);

    // The window has room by the new resume time: Stave continues the stage with a resume turn, not before that time.
    await setUsageWindow(usageFile, 10, Math.floor(Date.now() / 1000) + 3600);
    await expect.poll(async () => resumeTurns(await read()).length, { timeout: 150_000, intervals: [2_000, 5_000] }).toBe(1);
    expect(Date.parse(resumeTurns(detail)[0]!.createdAt)).toBeGreaterThanOrEqual(Date.parse(secondResumeAt));
    // The resume turn reaches the CLI (its record lands after the run's event).
    await expect.poll(async () => (await readRunTurns(fakeDir)).length, { timeout: 30_000, intervals: [500, 1_000] }).toBeGreaterThanOrEqual(2);
    const turns = await readRunTurns(fakeDir);
    expect(Date.parse(turns[1]!.at)).toBeGreaterThanOrEqual(Date.parse(secondResumeAt));
    expect(detail!.agentRun.pauseReason).not.toBe("usage-limit");
    await page.screenshot({ path: testInfo.outputPath("usage-limit-resumed.png") });
    await writeFile(testInfo.outputPath("usage-limit-run.json"), JSON.stringify({ paused, waitedAgain, resumed: detail, turns }, null, 2));
  } catch (error) {
    // What the run and the stand-in saw, for a failure that happened in the product.
    const seen = detail as AgentRunDetail | null;
    await writeFile(testInfo.outputPath("diagnostics.json"), JSON.stringify({
      run: seen?.agentRun ?? null, stages: seen?.stages ?? null,
      events: seen?.events.map((event) => ({ kind: event.kind, createdAt: event.createdAt, detail: event.detail })) ?? null,
      turns: await readRunTurns(fakeDir).catch(() => null),
    }, null, 2)).catch(() => undefined);
    throw error;
  } finally {
    const opened = stave as Awaited<ReturnType<typeof launchStave>> | null;
    const run = detail as AgentRunDetail | null;
    if (opened && run) await opened.page.evaluate(async (id) => window.api!.agentRuns!.cancel({ agentRunId: id }), run.agentRun.id).catch(() => undefined);
    await opened?.close();
    // A killed Electron's helpers can still be writing into the profile for a moment.
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => undefined);
  }
});
