import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentConfig } from "@/lib/agents/schema";
import { launchStave, seedRepository } from "./harness/stave-app";

/**
 * A usage limit in a real Agent Run, reproduced without spending a real
 * account: a stand-in `claude` CLI (`harness/fake-claude-cli.cjs`) ends the
 * run's first turn at a five-hour limit that resets five seconds later, and a
 * fixture file stands in for the account usage window Stave reads
 * (`STAVE_E2E_ACCOUNT_USAGE_FILE`). Everything between is the product: the
 * run pauses on the limit with a resume time, shows it, reads the window when
 * the time comes, and continues the stage on its own with a resume turn.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const GOAL = "Create a file named HELLO.md containing hello and report done.";

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

test("a run that hits a usage limit waits for the reset and continues on its own", async ({}, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-usage-limit-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  await mkdir(repositoryPath); await mkdir(fakeDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Usage limit validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  // The CLI Stave launches: this test's Node running the stand-in, with its state directory.
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
  await chmod(wrapper, 0o755);
  // The account's usage window once the limit has reset: room to work.
  const usageFile = path.join(directory, "usage.json");
  await writeFile(usageFile, JSON.stringify({ claude: { session: { usedPercent: 10, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } }));

  const profileDir = path.join(directory, "profile");
  await mkdir(profileDir);
  const stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper, STAVE_E2E_ACCOUNT_USAGE_FILE: usageFile } });
  const agent = buildAgent();
  let detail: AgentRunDetail | null = null;
  try {
    await seedRepository(stave.page, { repositoryPath, settings: { customAgents: [agent], autoRoutingEnabled: false, themeMode: "dark" } });
    await stave.page.waitForTimeout(2_000);
    await stave.page.getByRole("button", { name: "Agents", exact: true }).click();
    await stave.page.getByRole("button", { name: new RegExp(`^${agent.name}`) }).click();
    await stave.page.getByRole("button", { name: "Assign…", exact: true }).click();
    const dialog = stave.page.getByRole("dialog", { name: "Kick off workspace" });
    await dialog.getByRole("textbox", { name: "Work source" }).fill(GOAL);
    await dialog.getByRole("combobox", { name: "Where" }).click();
    await stave.page.getByRole("option", { name: "Current workspace" }).click();
    await dialog.screenshot({ path: testInfo.outputPath("kickoff.png") });
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });

    let agentRunId = "";
    await expect.poll(async () => {
      const listed = await stave.page.evaluate(async () => {
        const workspaces = await window.api!.persistence!.listWorkspaces!();
        const runs = await Promise.all(workspaces.rows.map((row) => window.api!.agentRuns!.list({ workspaceId: row.id, includeActive: true })));
        return runs.flatMap((result) => result.agentRuns);
      });
      agentRunId = listed[0]?.id ?? "";
      return agentRunId;
    }, { timeout: 60_000, intervals: [500, 1_000] }).toBeTruthy();
    const read = async () => {
      const response = await stave.page.evaluate(async (id) => window.api!.agentRuns!.get({ agentRunId: id }), agentRunId);
      detail = response.agentRun;
      return detail;
    };

    // The first turn ends at the limit: the run pauses with a resume time a minute past the reset.
    await expect.poll(async () => (await read())?.agentRun.pauseReason, { timeout: 60_000, intervals: [500, 1_000] }).toBe("usage-limit");
    const paused = detail!;
    expect(paused.agentRun.state).toBe("paused");
    expect(paused.agentRun.usageLimit?.resumeAt).toBeTruthy();
    expect(Date.parse(paused.agentRun.usageLimit!.resumeAt!)).toBeGreaterThan(Date.now());
    await stave.page.screenshot({ path: testInfo.outputPath("usage-limit-paused.png") });

    // At the resume time Stave reads the window, finds room and continues the stage with a resume turn.
    await expect.poll(async () => {
      const current = await read();
      return current?.events.some((event) => event.kind === "turn-started" && event.detail.reason === "resume-after-usage-limit") ?? false;
    }, { timeout: 150_000, intervals: [2_000, 5_000] }).toBe(true);
    const turns = (await readFile(path.join(fakeDir, "turns.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { runTurn: boolean; resumed: boolean }).filter((turn) => turn.runTurn);
    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(detail!.agentRun.pauseReason).not.toBe("usage-limit");
    await stave.page.screenshot({ path: testInfo.outputPath("usage-limit-resumed.png") });
    await writeFile(testInfo.outputPath("usage-limit-run.json"), JSON.stringify({ paused, resumed: detail }, null, 2));
  } catch (error) {
    // What the run and the stand-in saw, for a failure that happened in the product.
    const seen = detail as AgentRunDetail | null;
    await writeFile(testInfo.outputPath("diagnostics.json"), JSON.stringify({
      run: seen?.agentRun ?? null, stages: seen?.stages ?? null,
      events: seen?.events.map((event) => ({ kind: event.kind, detail: event.detail })) ?? null,
      turns: existsSync(path.join(fakeDir, "turns.jsonl")) ? await readFile(path.join(fakeDir, "turns.jsonl"), "utf8") : null,
    }, null, 2)).catch(() => undefined);
    throw error;
  } finally {
    if (detail) await stave.page.evaluate(async (id) => window.api!.agentRuns!.cancel({ agentRunId: id }), (detail as AgentRunDetail).agentRun.id).catch(() => undefined);
    await stave.close();
    if (existsSync(directory)) await rm(directory, { recursive: true, force: true });
  }
});
